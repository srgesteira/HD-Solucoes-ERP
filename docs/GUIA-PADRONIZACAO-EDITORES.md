# Guia de Execução — Padronização dos Editores de Pedido

**Projeto:** HD Soluções ERP  
**Branch:** `feature/padronizacao-editores-pedido`  
**Dependência:** Fatia C (field-permissions) na `main` — cumprida.

## Princípio do padrão único
Um padrão visual/comportamental para telas equivalentes. Componentes partilhados, nunca cópias divergentes.

## Fatias

| Fatia | Conteúdo | Estado |
|-------|----------|--------|
| **1** | Ordem: Dados → Condições → Itens → Totais → Observações gerais | ✅ |
| **2** | `item_notes` nas 3 tabelas + UI sob a descrição | ✅ |
| **3** | Impostos readonly via field-permissions (UI + API 403) | ✅ |
| **4** | Combobox produto unificado + mapa de propagação | ✅ |

## Decisões
- `client_notes` (orçamento/impressão) ≠ `item_notes` (obs operacional da linha).
- Fora do Faturamento: só **alíquotas** (% ICMS/% IPI) travadas; valores R$ recalculam com qtd/preço.
- Componente único: `src/components/products/product-combobox-field.tsx` (digitação + lupa → catálogo).

## Mapa de propagação do combobox de produto

| Local | Situação |
|-------|----------|
| Orçamento / PV / PC (editores de itens) | ✅ `ProductComboboxField` |
| Lupa → `ProductCatalogPickerModal` | ✅ mantido |
| Almoxarifado (`stock-operations-tab`, `manual-inventory-out-modal`, `/inventory/adjust`) | ⏳ fatia futura |
| PCP (`pcp-planning-view`) | ⏳ fatia futura |
| Engenharia (`product-composition-panel`) | ⏳ fatia futura |
| Compras — reconciliação NF (`invoices/reconcile`) | ⏳ fatia futura |
