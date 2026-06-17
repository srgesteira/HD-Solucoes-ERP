# Frente 1 — Passo 0: Investigação do empenho (`reserved_quantity`)

**Data:** junho/2026  
**Status:** concluído — aguardando OK do Helder para Passo 1  
**Nenhum código foi alterado nesta investigação.**

---

## 1. Onde `reserved_quantity` é **lido** no MRP

| Arquivo | Função | O que faz |
|---------|--------|-----------|
| `src/modules/almoxarifado/lib/inventory-availability.ts` | `fetchProductAvailabilityMap` | Lê `inventory.reserved_quantity` por produto (batch). |
| idem | `buildAvailability` | Calcula `available = max(0, on_hand + incoming + in_production − reserved)`. |
| idem | `shortageFromAvailability` | `shortage = max(0, needed − available)`. |
| `src/modules/pcp/lib/mrp-service.ts` | `getNetRequirements` | Chama `fetchProductAvailabilityMap`; expõe `reserved_quantity`, `available`, `shortage` em `MaterialRequirement[]`. |
| idem | `calculateMaterialRequirements` | `calculateNeededMaterials` → `getNetRequirements`. |
| `src/app/api/inventory/check/route.ts` | GET handler | API de consulta pontual (usa availability). |
| `src/components/almoxarifado/inventory-balances-table.tsx` | UI | Exibe coluna reservado. |

**Fórmula activa (código):**

```
disponível = quantity_on_hand + quantity_incoming + quantity_in_production − reserved_quantity
shortage   = max(0, needed − disponível)
```

**Nota:** `quantity_incoming` e `quantity_in_production` são calculados em runtime a partir de PCs e OPs activas — **não** vêm só da tabela `inventory`.

---

## 2. Onde `reserved_quantity` é **escrito** hoje

| Arquivo | Função / rota | Tipo de escrita |
|---------|---------------|-----------------|
| `src/modules/almoxarifado/lib/inventory-adjustment.ts` | `applyInventoryBalanceUpdate` | **Manual** — ajuste de inventário (`PUT/PATCH` via `/api/inventory`). |
| `src/app/(app)/inventory/adjust/page.tsx` | UI | Formulário de ajuste com campo "Reservado". |
| `src/app/api/inventory/route.ts` | POST | Persiste `reserved_quantity` do body no ajuste. |
| `src/modules/almoxarifado/lib/inventory-outbound.ts` | `applyInventoryOutbound` | **Insert** de linha nova com `reserved_quantity: 0` (não incrementa reserva). |
| `src/modules/almoxarifado/lib/inventory-inbound.ts` | inbound | Idem — insert com `reserved_quantity: 0`. |
| `src/modules/almoxarifado/lib/inventory-balance-reconcile.ts` | `reconcileInventoryFromMovements` | Reconcilia só `quantity_on_hand` a partir de movimentos; insert default `reserved_quantity: 0`. |

**Conclusão:** não existe writer automático ligado ao MRP, abastecimento, venda ou cancelamento. O campo só muda via **ajuste manual** do almoxarifado.

**Legado removido:** existia empenho errado como movimento físico `"Empenho MRP%"` em `inventory_movements`. Hoje só há **limpeza** desse legado em `legacy-mrp-empenho.ts` (chamada no abastecimento), não criação de novo empenho legado.

---

## 3. Fluxo reverso — cancelamento de OP e empenho

**Arquivo:** `src/modules/reverse/lib/production-cancellation-service.ts` → `cancelProductionOrder`

| Comportamento actual | Detalhe |
|---------------------|---------|
| Altera OP | `status = cancelled` + metadados de cancelamento |
| Audit | `recordAuditEvent` com `event_kind: production_order_cancelled` |
| Material físico | **Não** repõe estoque automaticamente (comentário explícito no código) |
| `reserved_quantity` | **Não toca** — zero referências ao campo ou a reservas |
| Compras ligadas | **Não** cancela PCs |
| Pedido de venda | **Não** altera PV |

**Conclusão:** Passo 3 da Frente 1 terá de **adicionar** liberação de empenho aqui (hoje inexistente).

---

## 4. Abastecimento — `applyProductionSupply`

**Arquivo:** `src/modules/almoxarifado/lib/production-supply.ts` → `applyProductionSupply`  
**Entrada UI:** `POST /api/inventory/production-supply` · tab Abastecimento no almoxarifado

| Passo | O que faz | Toca `reserved_quantity`? |
|-------|-----------|---------------------------|
| Valida item/OP | Rejeita sugestão, já abastecido, OP cancelada | Não |
| Calcula BOM | `calculateNeededMaterialsForProductQty` + filtro MO | Não |
| Limpeza legado | `removeLegacyMrpEmpenhoForProductionOrder` — apaga movimentos `"Empenho MRP%"` e reconcilia **on_hand** | Não (só movimentos físicos legados) |
| Baixa física | `applyInventoryOutbound` por componente (`origin: production_supply`) | Não — só decrementa `quantity_on_hand` |
| Marca item | `warehouse_supplied_at` | Não |

**Conclusão:** abastecimento baixa **real** (`quantity_on_hand`) mas **não libera empenho** — coerente com o facto de empenho automático ainda não existir.

---

## 5. Pontos de "efetivar" MRP (onde o Passo 1 deve hookar)

Sugestões (`is_suggestion=true`) **não** devem empenhar. Efetivação actual:

| Gatilho | Arquivo | Função |
|---------|---------|--------|
| Programar datas na linha | `src/app/api/pcp/program-production/route.ts` | `commitMrpSuggestionsForOrderItem` |
| Iniciar produção | `src/app/api/pcp/start-production/route.ts` | idem |
| Botão "Efetivar sugestões" (PCP) | `src/app/api/pcp/mrp-suggestions/route.ts` | `commitMrpSuggestionsForTenant` |
| MRP em lote com `confirm:true` | `src/app/api/mrp/run/route.ts` | `processMrpForPendingOrders(..., confirm)` |

Todas convergem em `mrp-service.ts`:

- `commitMrpSuggestionsForOrderItem` — flip `is_suggestion` → `false` (OP, item, PCs ligados)
- `commitMrpSuggestionsForTenant` — efetiva todas as sugestões do tenant

**Nenhuma** dessas funções altera inventário ou reserva hoje.

---

## 6. Tabela de detalhe de reservas

**Grep em todo o repo:** `inventory_reservation` → **zero ocorrências**.

Não existe tabela de detalhe. `inventory.reserved_quantity` é um **agregado por produto** sem rastreio de origem (OP, PV, item).

**Implicação para Passo 1:** para liberar empenho por OP específica (Passos 2 e 3), será necessária migration aditiva, por exemplo:

```
inventory_reservations (
  id, tenant_id, product_id, quantity,
  source_kind,   -- ex.: 'production_order_item' | 'sales_order_item'
  source_id,
  created_at, released_at, ...
)
```

Com trigger ou serviço que mantém `inventory.reserved_quantity = SUM(quantity) WHERE released_at IS NULL` por produto — **proposta a detalhar no Passo 1, SQL mostrado antes de aplicar.**

---

## 7. Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| MRP lê empenho? | Sim — via `fetchProductAvailabilityMap` → `getNetRequirements` |
| MRP escreve empenho? | **Não** |
| Abastecimento libera empenho? | **Não** (só baixa física) |
| Cancelamento OP libera empenho? | **Não** |
| Venda confirma empenha acabado? | **Não** (Passo 4) |
| Tabela de detalhe? | **Não existe** |
| Empenho legado? | Movimentos `"Empenho MRP%"` — só limpeza no abastecimento |

---

## 8. Proposta técnica preliminar (Passo 1 — não implementado)

1. Migration `inventory_reservations` + RLS + índices `(tenant_id, product_id)`, `(tenant_id, source_kind, source_id)`.
2. Serviço `src/modules/almoxarifado/lib/inventory-reservations.ts`:
   - `reserveForProductionMaterials(admin, tenantId, orderItemId)` — chamado após efetivar MRP
   - `releaseForProductionSupply(...)` — Passo 2
   - `releaseForProductionCancellation(...)` — Passo 3
   - `reserveFinishedGoodsForSalesOrder(...)` — Passo 4
3. Hook em `commitMrpSuggestionsForOrderItem` (e/ou após explosão BOM da OP efetivada).
4. Eventos no `audit_log` para reserva/liberação.

**Aguardando validação do Helder para iniciar Passo 1.**
