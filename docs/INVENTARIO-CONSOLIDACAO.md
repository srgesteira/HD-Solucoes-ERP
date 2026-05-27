# Inventário de Consolidação — hd-erp → HD Soluções ERP (monolito modular)

**Data:** 27/05/2026  
**Contexto:** decisão de abandonar multi-app e consolidar num **monolito modular** (1 Next.js).  
**Regra desta fase:** inventário apenas — **sem mover/copiar/apagar** código.

---

## Seção 1 — O que TRAZER do `hd-erp`

### 1) Migrations: `enabled_modules` (acesso por módulo) + `module_keys` em `role_permissions`
- **Origem (hd-erp)**: `hd-erp/supabase/migrations/00_core/003_user_module_access.sql`
- **Destino sugerido (HD Soluções ERP)**: `supabase/migrations/2026MMDD_user_module_access.sql` (nova migration, adaptada ao schema do monolito)
- **Justificativa**: dá base para **menu/rotas condicionais por módulo** (licenciamento e UX), e permite aplicar perfis (cargos) que liberam múltiplos módulos via `module_keys`.

### 2) Migrations: seed dos 30 cargos R2 (role_permissions)
- **Origem (hd-erp)**: `hd-erp/supabase/migrations/00_core/003_role_permissions_seed.sql`
- **Destino sugerido (HD Soluções ERP)**: `supabase/migrations/2026MMDD_role_permissions_seed.sql` (nova migration, ajustando nomes/colunas se necessário)
- **Justificativa**: acelera implantação real (R2 Speed Air) com **perfil pronto** → permissões + módulo principal; reduz configuração manual por utilizador.
- **Resposta (investigado)**: no monolito **não existe** migration criando `public.role_permissions` (não há ocorrência nas migrations atuais), e o código do monolito também não referencia esta tabela. Portanto, para trazer o seed do hd-erp, será necessário **criar a tabela** no monolito (migration nova) antes de popular.

### 3) Migration: `event_log` (auditoria de eventos)
- **Origem (hd-erp)**: `hd-erp/supabase/migrations/00_core/001_schemas_and_event_log.sql` (bloco `public.event_log`)
- **Destino sugerido (HD Soluções ERP)**: `supabase/migrations/2026MMDD_event_log.sql` (somente a tabela + índices; sem Realtime)
- **Justificativa**: ter um **registro auditável** de eventos (quem fez o quê e quando) é útil mesmo no monolito; serve de base para automações/agentes no futuro.
- **Resposta (investigado)**: o monolito **já tem** `public.event_log` em `supabase/migrations/20260519230000_v2_schemas_and_event_log.sql` com colunas:
  - `id`, `event_name`, `payload`, `tenant_id`, `published_at`, `processed_by`, `idempotency_key`
  - Sem `published_by`, `retry_count`, `last_error`
  - Há também linha de Realtime no final (no monolito, essa parte deve ser removida/evitada nas novas migrations).
- **Decisão**: manter o **superset** de colunas do hd-erp **não é obrigatório** para a consolidação; recomendação prática:
  - **Manter exatamente como já está no monolito** (não mexer nesta migration existente), e se precisarmos de `published_by/retry_count/last_error` no futuro, adicionar em **migration nova**.

### 4) Migration: `credit_analysis` (gate Faturamento → PCP)
- **Origem (hd-erp)**: `hd-erp/supabase/migrations/00_core/004_credit_analysis.sql`
- **Destino sugerido (HD Soluções ERP)**: `supabase/migrations/2026MMDD_credit_analysis.sql`
- **Justificativa**: implementa o fluxo “confirmar PV → criar análise pendente → aprovar/rejeitar → avançar PCP”. É uma melhoria funcional clara com pouco acoplamento.
- **Resposta (investigado — schema atual do monolito via `src/lib/types/database.ts`)**:
  - `public.sales_orders` existe e tem: `id`, `tenant_id`, `quote_id`, `order_number`, `total`, `status` (string), `ready_for_invoice` (bool) e `mrp_processed` (bool), entre outros.
  - `public.quotes` existe e referencia `customer_id` (FK para `public.customers`).
  - `public.customers` existe, **mas não tem** `credit_limit` nem `credit_score` hoje.
  - `public.receivables` existe e tem: `tenant_id`, `client_document`, `current_amount`, `status`, `sales_order_id` (FK opcional), etc.
- **Adaptações necessárias no SQL antes da Fase 3**:
  - Adicionar em `public.customers`: `credit_limit numeric(14,2)` e `credit_score text` (igual ao hd-erp).
  - Criar tabela `public.credit_analysis` (igual ao hd-erp) com `tenant_id`, `sales_order_ref` (uuid), `sales_order_number`, `customer_id`, `order_total`, `status`, etc.
  - Trigger: no monolito, o gatilho pode continuar a ser “`AFTER UPDATE OF status ON public.sales_orders`” e criar análise quando `NEW.status = 'confirmed'`.
  - Cálculos em `receivables`: no hd-erp há 2 somas (open e overdue), mas a soma de overdue no hd-erp está **global por tenant**; no monolito deve ser ajustada para **o mesmo cliente** (por `client_document = customers.document`) para não inflar o risco por cliente.

### 5) Tela de Análise de Crédito (Faturamento)
- **Origem (hd-erp)**:
  - UI: `hd-erp/apps/faturamento/src/app/credit-analysis/page.tsx`
  - APIs: `hd-erp/apps/faturamento/src/app/api/credit-analysis/route.ts` e `hd-erp/apps/faturamento/src/app/api/credit-analysis/[id]/*/route.ts`
  - Lib: `hd-erp/apps/faturamento/src/lib/credit/credit-analysis.ts`
- **Destino sugerido (HD Soluções ERP)**:
  - UI: `src/app/(app)/finance/credit-analysis/page.tsx` **ou** `src/app/(app)/faturamento/credit-analysis/page.tsx` (decidir padrão de rotas)
  - APIs: `src/app/api/finance/credit-analysis/*` **ou** `src/app/api/faturamento/credit-analysis/*`
  - Lib: `src/lib/finance/credit-analysis.ts` **ou** `src/modules/faturamento/lib/credit-analysis.ts` (na Fase 2/3)
- **Justificativa**: entrega a funcionalidade completa (listagem + aprovar/rejeitar) e conecta direto com a migration `credit_analysis`.

### 6) Mini-dashboards (home) e endpoint `module-kpis`
- **Origem (hd-erp)**:
  - Home com cards: `hd-erp/apps/shell/src/app/page.tsx`
  - Fetch KPI: `hd-erp/apps/shell/src/lib/module-kpi.ts`
  - API shell: `hd-erp/apps/shell/src/app/api/module-kpis/[module]/route.ts`
- **Destino sugerido (HD Soluções ERP)**:
  - Home: `src/app/(app)/page.tsx` (ou equivalente no monolito)
  - Lib KPI: `src/lib/dashboard/module-kpi.ts`
  - API KPI agregadora: `src/app/api/dashboard/kpis/route.ts` (padrão único no monolito)
- **Justificativa**: melhora UX inicial e cria base para **Dashboard Gerencial**.
- **Decisão (investigado e definido)**: no monolito, `module-kpis` **não deve ser HTTP por módulo**. Recomenda-se:
  - criar funções internas por módulo (ex.: `src/modules/vendas/lib/kpis.ts` com `getVendasKpis()`),
  - e um único endpoint agregador `GET /api/dashboard/kpis` que chama essas funções diretamente.

### 7) Sidebar com agrupamentos (Núcleo/Admin/Logística/Operação/Pessoas)
- **Origem (hd-erp)**:
  - `hd-erp/apps/shell/src/components/module-sidebar.tsx`
  - `hd-erp/apps/shell/src/components/sidebar-nav-group.tsx`
  - Registry: `hd-erp/apps/shell/src/lib/modules-registry.ts`
- **Destino sugerido (HD Soluções ERP)**:
  - UI: `src/components/layout/app-shell.tsx` (integrar o agrupamento) **ou** `src/components/shared/sidebar/*`
  - Registry: `src/lib/modules/registry.ts` (ou `src/modules/*/registry.ts` na consolidação)
- **Justificativa**: navegação por módulo fica consistente e permite **filtrar por `enabled_modules`**.

### 8) Dashboard Gerencial (conceito “mãe”)
- **Origem (hd-erp)**: não há artefato “dashboard-gerencial” explícito (há home com mini-dashboards e endpoints KPI).
- **Destino sugerido (HD Soluções ERP)**: `src/app/(app)/finance/dashboard/` e/ou `src/app/(app)/dashboard-gerencial/page.tsx`
- **Justificativa**: visão consolidada para admin/diretoria; útil para decisões rápidas.
- **Decisão**: **CONSTRUÇÃO NOVA** — não vem do hd-erp como página pronta. Será criada na Fase 3 a partir dos KPIs internos (Seção 1 item 6/9).

### 9) Endpoint `GET /api/dashboard/kpis`
- **Origem (hd-erp)**: `hd-erp/apps/faturamento/src/app/api/dashboard/kpis/route.ts` (existe no faturamento)
- **Destino sugerido (HD Soluções ERP)**: `src/app/api/dashboard/kpis/route.ts`
- **Justificativa**: padroniza agregação de KPIs no monolito (home + dashboard gerencial).

### 10) Zod schemas / contracts evoluídos
- **Origem (hd-erp)**: `hd-erp/packages/contracts/src/schemas/*` e `hd-erp/packages/contracts/src/*`
- **Destino sugerido (HD Soluções ERP)**: `src/lib/schemas/*` (ou `src/shared/contracts/*` na Fase 2/3)
- **Justificativa**: schemas já padronizados (quote, sales-order, purchase-order, purchase-invoice, user-permissions, etc.) reduzem bugs e aceleram refactors.
- **Resposta (investigado — schema por schema)**:
  - `bdi.schema.ts`: **igual** no monolito → **não trazer**
  - `company.schema.ts`: **igual** no monolito → **não trazer**
  - `pacote-a-finance.schema.ts`: **igual** no monolito → **não trazer**
  - `purchase-invoice.schema.ts`: **igual** no monolito → **não trazer**
  - `purchase-order.schema.ts`: **igual** no monolito → **não trazer**
  - `sales-order.schema.ts`: **igual** no monolito → **não trazer**
  - `user-permissions.schema.ts`: **igual** no monolito → **não trazer**
  - `quote.schema.ts`: **diferente** (hd-erp tem `delivery_business_days` + compat legada) → **trazer delta do hd-erp**
  - `product.schema.ts`: **diferente** (hd-erp tem `released_for_sale`, `source_quote_id`, `engineering_workflow_status`) → **trazer delta do hd-erp**

### 11) Componentes UI novos/estabilizados (inputs + menus)
- **Origem (hd-erp)**: `hd-erp/packages/ui/src/*` (ex.: `row-actions-menu.tsx`, `numeric-input.tsx`, `decimal-input.tsx`, `tabs.tsx`, `app-page.tsx`, etc.)
- **Destino sugerido (HD Soluções ERP)**: `src/components/ui/*` (já existe base) + onde fizer sentido (ex.: `src/components/shared/*`)
- **Justificativa**: muitos desses componentes já existem no monolito, mas o hd-erp pode trazer melhorias de UX e consistência.
- **Resposta (investigado — componente por componente)**:
  - `numeric-input.tsx`: **igual** (monolito já tem) → **não trazer**
  - `decimal-input.tsx`: **igual** (monolito já tem) → **não trazer**
  - `tabs.tsx`: **igual** (monolito já tem) → **não trazer**
  - `row-actions-menu.tsx`: **igual** (monolito já tem) → **não trazer**
  - `app-page.tsx`: **não existe** no monolito → **trazer** (útil para padronizar cabeçalho/padding das páginas)

### 12) Helper de permissões por módulo (TypeScript): `userHasModule` + `userVisibleModules`
- **Origem (hd-erp)**:
  - `hd-erp/packages/auth/src/permissions.ts` (`userHasModule`, `userVisibleModules`, `normalizeEnabledModules`)
- **Destino sugerido (HD Soluções ERP)**:
  - `src/lib/permissions.ts` (já existe; trazer **apenas o delta** para suportar `enabled_modules`)
- **Justificativa**: sem estes helpers, `enabled_modules` (SQL) não vira comportamento: a sidebar/home não conseguem filtrar módulos por utilizador.
- **Resolvido (decisão Helder)**: padronizar as chaves no monolito para **português** (menu):
  - `core`, `engenharia`, `vendas`, `faturamento`, `compras`, `pcp`, `almoxarifado`, `expedicao`, `producao`, `qualidade`, `rh`, `boards`
- **Mapa de conversão (monolito atual → chaves PT)**:
  - `sales` → `vendas`
  - `purchasing` → `compras`
  - `finance` → `faturamento`
  - `production` → `producao`
  - `warehouse` ou `inventory` → `almoxarifado`
  - `shipping` ou `logistics` → `expedicao` (**⚠️ validar na Fase 3 se `logistics` cobre apenas expedição ou também outras rotas**)
  - `hr` → `rh`
  - `engineering` → `engenharia`
  - `quality` → `qualidade`
  - `mrp` ou `pcp` → `pcp`
  - `boards` → `boards`
- **Regra**: se surgir chave de permissão do monolito **fora do mapa**, **parar** e pedir validação antes de decidir.

### 13) Hooks de auth evoluídos (useMe, usePermissions) — trazer apenas melhorias
- **Origem (hd-erp)**:
  - `hd-erp/packages/auth/src/hooks/use-me.ts`
  - `hd-erp/packages/auth/src/hooks/use-permissions.ts`
- **Destino sugerido (HD Soluções ERP)**:
  - `src/hooks/use-me.ts`
  - `src/hooks/use-permissions.ts`
- **Justificativa**: o monolito tem versões funcionando, mas precisam evoluir para incluir `enabled_modules` e/ou `role_keys` quando formos implementar menu dinâmico.
- **Diff específico (investigado)**:
  - `use-me` do hd-erp inclui campos extras em `MeResponse`: `enabled_modules`, `role_keys`, `full_name`, `email`.
  - `use-permissions` do hd-erp é conceptualmente igual ao monolito (merge defaults + `me.permissions`), portanto a mudança é principalmente **o shape do `MeResponse`** e endpoints que passem a devolver `enabled_modules`.

### 14) Bus de eventos interno (CÓDIGO NOVO — substitui Realtime/@hd/events)
- **Origem**: código novo (não vem do hd-erp; o `@hd/events` distribuído será descartado).
- **Destino sugerido (HD Soluções ERP)**:
  - `src/lib/events/bus.ts`
  - `src/lib/events/register.ts`
- **Justificativa**: substitui pub/sub distribuído por chamadas internas síncronas, simplificando fluxos (Compras → Qualidade → Almoxarifado; Vendas → Faturamento → PCP).
- **Funcionalidade requerida**: `subscribe(event, handler)` + `publish(event, payload, tenantId)` em memória; persistência opcional em `public.event_log`.

### 15) Tela de gestão de usuários (edição de `enabled_modules` + perfis R2)
- **Origem (hd-erp)**:
  - UI: `hd-erp/apps/core/src/app/settings/users/page.tsx`
  - APIs: `hd-erp/apps/core/src/app/api/tenant/users/route.ts`, `hd-erp/apps/core/src/app/api/role-permissions/route.ts`, `hd-erp/apps/core/src/app/api/users/[id]/module-access/route.ts`
- **Destino sugerido (HD Soluções ERP)**:
  - UI: `src/app/(app)/settings/users/page.tsx` (já existe no monolito; hoje edita `user_profiles.permissions` — precisa evoluir para editar `enabled_modules`)
  - APIs: `src/app/api/tenant/users/route.ts` + `src/app/api/role-permissions/route.ts` + `src/app/api/users/[id]/module-access/route.ts` (novas rotas)
- **Justificativa**: sem esta tela, `enabled_modules` fica sem interface de edição e o mapeamento R2 não tem como ser aplicado.
- **Funcionalidade requerida**:
  - lista utilizadores do tenant;
  - checkboxes por módulo (menu) e opção “admin_all” → `["*"]`;
  - dropdown com cargos R2 (30 perfis) que aplica `module_keys` automaticamente.

---

## Seção 2 — O que DESCARTAR do `hd-erp`

> Aqui “descartar” significa **não migrar para o monolito**. O `hd-erp` será arquivado como referência.

- **Estrutura multi-app inteira**: `hd-erp/apps/*` como apps independentes (vira `src/modules/*` no monolito).
- **Workspaces/packages separados**: `hd-erp/packages/*` como pacotes de build (vira `src/shared/*` / `src/lib/*`).
- **Infra de monorepo**: `hd-erp/pnpm-workspace.yaml`, `hd-erp/turbo.json`, `hd-erp/vercel/*`, `hd-erp/apps/*/vercel.json`.
- **Config duplicada**: múltiplos `next.config.*` por app e presets específicos por projeto.
- **Rewrites cross-app** e proxy entre apps (ex.: shell → core) — no monolito vira **import/chamada direta**.
- **Scripts de port/migração pontual** do hd-erp (ex.: scripts criados para “ponte” com o legado) — já cumpriram função.
- **`@hd/events` / pub-sub distribuído** (Realtime/eventos entre apps) — será substituído por **bus interno** + opcional `event_log` (auditoria).

---

## Seção 3 — O que MANTER do `HD Soluções ERP` (não mexer nesta fase)

- **Regra de migrations**: não editar nenhuma migration existente em `supabase/migrations/*`. Só **adicionar novas**.

### Auth atual (arquivos específicos a manter estáveis)
- `src/middleware.ts` (gate de autenticação)
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `src/app/api/me/route.ts` (shape atual do `/api/me` até a migração planejada)
- Páginas de auth: `src/app/login/*`, `src/app/reset-password/*`, `src/app/forgot-password/*` (se existirem) e o fluxo de cookies/session

### APIs críticas que não devem ser “quebradas” durante refactor (lista por domínio)
- **Vendas**: `src/app/api/sales/quotes/*`, `src/app/api/sales/orders/*`, `src/app/api/sales/order-items/*`
- **Compras**: `src/app/api/purchasing/orders/*`, `src/app/api/purchasing/suppliers/*`, `src/app/api/purchasing/invoices/*`, `src/app/api/purchasing/requisitions/*`, `src/app/api/purchasing/schedule/*`
- **Produtos/Engenharia**: `src/app/api/products/*` (inclui componentes e histórico), `src/app/api/work-centers/*`
- **PCP/MRP/Produção**: `src/app/api/mrp/run/*`, `src/app/api/pcp/planning/*` e demais rotas `src/app/api/pcp/*`, `src/app/api/production/*`
- **Cadastros base**: `src/app/api/customers/*`, `src/app/api/departments/*`, `src/app/api/employees/*`

### Páginas de negócio já estáveis (amostra mínima que não deve regredir)
- Clientes: `src/app/(app)/customers/page.tsx`
- Orçamentos/Pedidos: `src/app/(app)/sales/quotes/*`, `src/app/(app)/sales/orders/*`
- Compras: `src/app/(app)/purchasing/orders/*`, `src/app/(app)/purchasing/suppliers/*`
- Produtos/BOM: `src/app/(app)/products/*`
- PCP/MRP: `src/app/(app)/pcp/planning/page.tsx`, `src/app/(app)/mrp/page.tsx`
- Configurações: `src/app/(app)/settings/work-centers/page.tsx`, `src/app/(app)/settings/users/page.tsx` (evoluir, mas sem quebrar o que já existe)


