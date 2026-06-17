# Guia de Execução — Cursor

**Projeto:** HD Soluções ERP  
**Papel do Cursor:** executor. As decisões de arquitetura já estão tomadas aqui. Execute fatia por fatia, na ordem. Não pule etapas, não reimplemente o que já existe.  
**Última atualização:** junho/2026  
**Documento irmão:** [`GUIA-SISTEMA-LAYOUT-E-FUNCIONAMENTO.md`](./GUIA-SISTEMA-LAYOUT-E-FUNCIONAMENTO.md) (§12 = roadmap resumido)

---

## Regras de ouro (valem para TODA tarefa abaixo)

1. **Migração antes do deploy.** Toda mudança de schema é uma migration em `supabase/migrations/`. Mostre o SQL antes de aplicar.
2. **Dry-run antes de backfill.** Nenhum `UPDATE`/`INSERT` em massa sem antes rodar a versão `SELECT` que mostra o que seria afetado.
3. **Build local antes do push.** `pnpm run build` tem que passar localmente. Se não passar, não sobe.
4. **Uma frente por vez.** Não comece a frente seguinte sem a anterior validada no navegador pelo Helder.
5. **Branch por feature.** `feature/<nome>`, validada no navegador, merge `--no-ff` via GitHub UI.
6. **Estender o que existe, nunca criar paralelo.** Se já há um caminho para "receber compra" / "calcular custo" / "fechar produção", use-o. Não crie um segundo.
7. **Investigar antes de corrigir.** Antes de mexer, leia o código existente e entenda o caminho atual. Descreva o que encontrou antes de propor a mudança.
8. **Isolamento por tenant é obrigatório.** Toda query nova filtra por `tenant_id`. Toda view nova usa `security_invoker`. Todo path de storage é por tenant.
9. **Determinístico no núcleo.** Cálculo de estoque, custo, MRP, fiscal e caixa é determinístico e auditável. IA só sugere/aponta, nunca decide.
10. **Auditável.** Mudanças sensíveis (cancelar OP, ajuste de estoque, override de empenho) passam pelo `audit_log` já existente.

**Quando parar e perguntar ao Helder:**

- Quando precisar validar algo no navegador (só ele consegue).
- Quando a decisão for de negócio (não técnica).
- Nunca pergunte detalhe técnico de implementação — isso é sua responsabilidade decidir.

---

## Contexto do que JÁ existe (não reconstruir)

Estes módulos estão no código, com migrations aplicadas no remoto. **Não toque neles a menos que a tarefa peça explicitamente.**

- Layout cronograma (15 telas) — `cronograma-layout.tsx`
- Motor fiscal (estrutura) — `fiscal_rules`, `fiscal_rule_applications`, `resolveFiscalRule`, `fiscal_status`
- Tela de regras fiscais — `/settings/fiscal-rules`
- Validade/revisão de regra fiscal — `valid_from`/`valid_until`/`last_reviewed_at`
- Disparo fiscal na conversão — `quote-convert.ts` → `applyFiscalToSalesOrderItems`
- AR provisório + sync de recebíveis — `generateReceivablesForSalesOrder(..., { provisional: true })`, `syncReceivablesForSalesOrder`
- Fluxo reverso (devolução venda/compra, cancelar OP) — `reverse/*-service.ts`, `/sales/returns`, `/purchasing/returns`
- Auditoria de negócio — `audit_log`, triggers, `AuditHistoryPanel`, `/api/audit-log`
- Saúde do dado — `/data-health`, `loadDataHealthIssues`
- Onboarding (checklist) — `/onboarding`, `loadOnboardingState`
- Urgência no menu — `menu-alerts.ts`
- Expedição (base) — `shipments`, `shipments-service`, `/logistics/shipping`
- IA assistente de NCM — `/api/ai/suggest-ncm`

**Fundação dos 4 estados de estoque (já no MRP):**

```
disponível = real + futuro + em_produção(acabado) − empenho
necessidade (shortage) = max(0, needed − disponível)
```

- Real: `inventory.quantity_on_hand`
- Futuro: saldo pendente em PCs (`purchase_order_items` via `fetchProductAvailabilityMap`)
- Em produção: OPs activas em `order_items` (via `fetchProductAvailabilityMap`)
- Empenho: `inventory.reserved_quantity` — **lido pelo MRP, mas SEM writers automáticos. É a Frente 1.**

---

## ORDEM DE EXECUÇÃO

```
FRENTE 1 — Empenho automático          ← começar AQUI
FRENTE 2 — Consolidar has_composition
FRENTE 3 — Inbox da Engenharia
FRENTE 4 — Abas Entrega/Coleta na Expedição
FRENTE 5 — Limpeza técnica
FRENTE 6 — Roteiro N operações (P3)
FRENTE 7 — Conciliação bancária (P3)
```

---

# FRENTE 1 — EMPENHO AUTOMÁTICO

**Objetivo:** fazer o sistema *escrever* automaticamente em `reserved_quantity` ao longo do ciclo MRP → abastecimento, completando a fundação dos 4 estados.

**Princípio:** *empenho reserva, abastecimento baixa.* Empenho nunca mexe em `quantity_on_hand`.

## Passo 0 — Investigação

Ver relatório em [`docs/FRENTE1-PASSO0-INVESTIGACAO-EMPENHO.md`](./FRENTE1-PASSO0-INVESTIGACAO-EMPENHO.md) (jun/2026).

## Passo 1 (fatia 1.1) — Empenhar na geração de necessidade do MRP

Quando o MRP é **efetivado** (não na sugestão/dry-run), reservar componentes em `reserved_quantity`, rastreável por OP/item.

**Modelagem:** investigar `inventory_reservations` (aditiva, tenant + RLS). Mostrar SQL antes de aplicar.

**Validação:** MRP efetivado → `reserved_quantity` sobe; `quantity_on_hand` inalterado.

## Passo 2 (fatia 1.2) — Liberar empenho no abastecimento

Em `applyProductionSupply`: baixa física igual hoje + liberar empenho na mesma medida.

**Validação:** abastecer OP → reserva zera, `quantity_on_hand` baixa.

## Passo 3 (fatia 1.3) — Liberar empenho no cancelamento de OP

Em `cancelProductionOrder`: OP cancelada antes de abastecer → liberar empenho; audit_log.

**Validação:** MRP efetivado → cancelar antes de abastecer → reserva volta.

## Passo 4 (fatia 1.4) — Empenho de produto acabado na venda

Ao confirmar PV de produto em estoque: reservar acabado; liberar na expedição/faturamento.

**Validação:** dois PVs competindo pelo mesmo acabado → segundo vê shortage.

---

# FRENTE 2 — CONSOLIDAR `has_composition`

Passo 0 → unificar regra → backfill com dry-run. **Antes da Frente 3.**

---

# FRENTE 3 — INBOX DA ENGENHARIA

Estender filtro `pending_composition` → fila com cliente, valor, urgência, origem comercial/própria.

---

# FRENTE 4 — ABAS ENTREGA/COLETA

UI only: abas `outbound` / `inbound`; status como filtro secundário.

---

# FRENTE 5 — LIMPEZA TÉCNICA

Tabelas mortas, endpoints órfãos, consolidar `fmtBRL`/data/badges. Grep + SELECT antes de remover.

---

# FRENTE 6 — ROTEIRO N OPERAÇÕES (P3)

`product_routing_steps` + `order_item_operations`. Default 1 operação = UX actual.

---

# FRENTE 7 — CONCILIAÇÃO BANCÁRIA (P3)

OFX/CSV + match com contas. **≠** conciliação NF-e compra.

---

## FORA DO ESCOPO DO CURSOR

- Preencher `fiscal_rules` → contadora.
- Genérico vs. vertical HVAC → Helder.

---

*Execute na ordem. Investigue antes de mexer. Pare para validação no navegador ao fim de cada fatia.*
