# Guia de Execução — Padronização dos Editores de Pedido

**Projeto:** HD Soluções ERP  
**Branch:** `feature/padronizacao-editores-pedido`  
**Papel do Cursor:** executor. Decisões de UX já tomadas.  
**Dependência:** Fatia C (field-permissions) na `main` — cumprida.

## Princípio do padrão único
Um padrão visual/comportamental para telas equivalentes. Componentes partilhados, nunca cópias divergentes. Ao criar o combobox de produto (Fatia 4), mapear onde mais propagar.

## Ordem de execução (fatiada por risco)

| Fatia | Conteúdo | Gate |
|-------|----------|------|
| **1** | Ordem: Dados → Condições → Itens → Totais → Observações gerais | build + validação browser |
| **2** | `item_notes` nas 3 tabelas + UI sob a descrição | ⛔ SQL antes do `db push` |
| **3** | Impostos readonly via field-permissions (UI + API 403) | build + validação |
| **4** | Combobox produto unificado + mapa de propagação | build + validação |

Não avançar fatia sem a anterior buildada. Commit ao fim de cada fatia.

## Decisões técnicas
- Orçamento: `client_notes` (impressão) mantém-se; `item_notes` é obs operacional da linha.
- Fatia 4: núcleo único + wrappers finos; unificar PV+PC primeiro, depois orçamento.
- Combobox: padrão de `SupplierSelectField` + lupa → `ProductCatalogPickerModal`.
