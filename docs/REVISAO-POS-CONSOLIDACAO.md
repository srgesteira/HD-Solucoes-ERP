# Revisão pós-consolidação — HD Soluções ERP

**Data da revisão:** 27/05/2026  
**Branch analisada:** `consolidacao-monolito-modular` (últimos commits incluem Fase 3 + `fix(auth)` + tipos Supabase)  
**Metodologia:** leitura estática, `pnpm type-check`, consultas read-only ao Supabase remoto ligado, sem alterações no código de produção.

**Problemas encontrados (totais por secção):** §1: 6 · §2: 1 · §3: 1 · §4: 2 · §5: 12 · §6: 5 · §7: 2 · §8: 2 · §9: 4 → **~35 itens** (muitos são riscos de endurecimento, não bloqueios de build).

---

## 1. Integridade estrutural

### `src/modules/` (12 pastas — inventário Fase 2 usa 11 domínios; `boards` é módulo extra)

| Pasta | Ficheiros | Estado |
|-------|-----------|--------|
| `almoxarifado` | 1 | ⚠️ Quase vazia (`lib/inventory-inbound.ts` apenas) |
| `boards` | 13 | OK |
| `compras` | 20 | OK |
| `core` | 19 | OK (tipos, tenant, KPIs, profile-access) |
| `engenharia` | 15 | OK |
| `expedicao` | 0 | ⚠️ **Pasta vazia** (placeholder de domínio) |
| `faturamento` | 2 | OK mas fino (`credit-analysis.ts`, `nfe/focusnfe.service.ts`) |
| `pcp` | 7 | OK |
| `producao` | 2 | OK mas fino (`production-line-sync.ts` + re-export lógico) |
| `qualidade` | 0 | ⚠️ **Pasta vazia** (placeholder) |
| `rh` | 3 | OK |
| `vendas` | 21 | OK |

**Total:** 103 ficheiros em `src/modules/`.

### `src/shared/` (8 pastas; pedido de “6” no inventário = auth, contracts, db, events, ui, utils)

| Pasta | Ficheiros | Estado |
|-------|-----------|--------|
| `auth` | 3 | OK (`permissions.ts`, `menu-modules.ts`, `modules-registry.ts`) |
| `config` | 0 | ⚠️ Vazia |
| `contracts` | 9 | OK |
| `data` | 0 | ⚠️ Vazia |
| `db` | 4 | OK (supabase client/server/admin + untyped-tables) |
| `events` | 3 | OK (`bus.ts`, `register.ts`, `publish.ts`) |
| `ui` | 12 | OK |
| `utils` | 7 | OK |

**Total:** 38 ficheiros em `src/shared/`.

### Órfãos / não movidos

- **`src/lib/`** — não existe (migração concluída).
- **`src/components/`** — **63 ficheiros** permanecem aqui (vendas, compras, kanban, pcp, dashboard, etc.). Isto é **esperado** na Fase 2 (rotas em `src/app/` + UI por domínio); não é regressão, mas **dívida de reorganização** se o alvo for 100% em `modules/*/components`.
- Não foram encontrados imports `@/lib/*` no código.

### Problemas nesta secção: **6**
(2 módulos vazios, 2 shared vazias, 1 módulo muito fino, 1 concentração massiva em `src/components/`)

---

## 2. Imports quebrados ou inconsistentes

### `pnpm type-check`

```
✅ PASSOU (exit 0, tsc --noEmit)
```

### Imports `../../../`

- **0 ocorrências** em `src/` (reorganização via `@/` está consistente).

### Imports `@hd/*` (monorepo antigo)

- **0 ocorrências** em `src/`.

### Imports duplicados (mesmo conceito, caminhos diferentes)

- ⚠️ **Não auditado exaustivamente** (exigiria análise por símbolo/ferramenta tipo knip/depcruise).
- Padrão dominante: `@/modules/...`, `@/shared/...`, `@/components/...`, `@/hooks/...` — sem `@/lib`.
- `database.ts` importado de `@/modules/core/types/database` de forma uniforme nos ficheiros amostrados.

### Problemas nesta secção: **1** (auditoria de duplicados pendente)

---

## 3. Banco de dados

### Migrations em `supabase/migrations/`

- **71 ficheiros `.sql`** no repositório.
- **`pnpm exec supabase migration list --linked`:** todas com coluna **Remote** preenchida (incluindo Fase 3):
  - `20260827120000_user_module_access.sql`
  - `20260827120100_role_permissions_seed.sql`
  - `20260827120200_credit_analysis.sql`

### Verificações no remoto (service role, read-only)

| Verificação | Resultado |
|-------------|-----------|
| `role_permissions` — contagem | ✅ **30 linhas** |
| `user_profiles.enabled_modules` | ✅ coluna existe (amostra OK) |
| `credit_analysis` | ✅ tabela existe (**2 linhas** no momento da revisão) |
| `event_log` | ✅ tabela existe (**0 linhas**) |

### Notas / possíveis duplicações

- ⚠️ **`event_log`** já existia em `20260519230000_v2_schemas_and_event_log.sql`; Fase 3 **não recriou** a tabela (correto). O código novo (`publish.ts`) usa colunas compatíveis com o schema existente.
- **`role_permissions` vs `rbac_role_permissions`:** no `database.ts` gerado coexistem `role_permissions` (R2 Speed Air) e tabelas `rbac_*` legadas — não é duplicação de migration recente, mas **dois modelos de RBAC** no mesmo DB (documentar para evitar confusão operacional).
- Push Fase 3 reportou `NOTICE ... already exists, skipping` em objetos pré-existentes (ambiente já parcialmente migrado) — **sem falha**, mas validar em staging limpo antes de deploy greenfield.

### Problemas nesta secção: **1** (dual RBAC / schema legado)

---

## 4. Funcionalidades novas trazidas do hd-erp

| Item | Implementado | Evidência | Funcionando |
|------|--------------|-----------|-------------|
| Sidebar dinâmica por `enabled_modules` | ✅ | `app-shell.tsx` + `usePermissions` + `menu-modules.ts` | ✅ Validado (member compras: Portal + Logística/Compras + Configurações) após `68b0dd3` |
| `userHasModule` | ✅ | `src/shared/auth/menu-modules.ts` | ✅ |
| `useMe` / `usePermissions` evoluídos | ✅ | `src/hooks/use-me.ts`, `use-permissions.ts`, `/api/me` | ✅ |
| `/settings/users` checkboxes + 30 cargos | ✅ | `settings/users/page.tsx`, `/api/role-permissions` | ✅ (UI só para não-admin; admin vê lista filtrada) |
| `/finance/credit-analysis` listagem + aprovar/rejeitar | ✅ | `page.tsx`, APIs `approve`/`reject`, `credit-analysis.ts` | ✅ API/UI; ⚠️ **sem guard `can("finance")` na página** |
| Trigger `credit_analysis` ao confirmar PV | ✅ | `20260827120200_credit_analysis.sql` → `fn_create_credit_analysis` em `sales_orders.status = 'confirmed'` | ✅ SQL presente (2 registos no DB) |
| Mini-dashboards `/home` | ✅ | `home/page.tsx`, `HOME_MODULES`, `/api/dashboard/kpis` | ✅ |
| Dashboard Gerencial `/dashboard-gerencial` | ✅ | `dashboard-gerencial/page.tsx` | ✅ (restrito no menu a `reports`/`finance` após fix auth) |
| `GET /api/dashboard/kpis` | ✅ | `src/app/api/dashboard/kpis/route.ts` | ✅ |
| Bus de eventos | ✅ | `bus.ts`, `register.ts`, `publish.ts` | ⚠️ Handlers são **stubs** (`console.info`); `publish` grava `event_log` |
| `AppPage` | ✅ | `src/shared/ui/app-page.tsx` | ✅ usado em home/credit-analysis |
| Delta `quote.schema.ts` | ✅ | `delivery_business_days` + legado | ✅ types OK |
| Delta `product.schema.ts` | ✅ | `released_for_sale`, `source_quote_id`, `engineering_workflow_status` | ✅ types OK |

### Problemas nesta secção: **2** (guard UI crédito; event bus sem integração PCP real)

---

## 5. Bloqueios de segurança

### Modelo actual

- **Menu:** filtrado via `enabled_modules` → bridge para flags legado `can("sales"|"purchasing"|...)`.
- **Páginas:** protecção **heterogénea** — algumas com `useEffect` + `router.replace`, outras só desactivam acções.
- **APIs:** subconjunto usa `currentUserCanModule` (vendas/compras/inventory); muitas rotas confiam só em tenant + RLS.

### `/sales/orders`

- ✅ **Bloqueia** utilizador sem `sales` (redirect `/home` + toast) — commit `68b0dd3`.

### Outras rotas — amostra

| Área | Página | Guard explícito? |
|------|--------|------------------|
| Vendas | `/sales/quotes` (listagem) | ⚠️ **Não** — só `canEditQuotes` para edição |
| Vendas | `/sales/quotes/[id]`, `edit` | Parcial (mensagem / redirect em edit) |
| Vendas | `/sales/orders/[id]` | ⚠️ **Não** redirect global |
| Compras | `/purchasing/dashboard` | ✅ `can("purchasing")` |
| Compras | `/purchasing/orders` (listagem) | ⚠️ **Não** encontrado |
| Financeiro | `/finance/receivables`, `payables`, `cash-flow` | ✅ `can("finance")` |
| Financeiro | `/finance/credit-analysis` | ⚠️ **Não** |
| Produção | `/production/orders` (listagem) | ⚠️ **Não** encontrado |
| Produção | `/production/orders/[id]/edit` | ✅ toast + redirect |
| Inventário | `/inventory` | ✅ |
| MRP | `/mrp` | ✅ redirect |
| Settings | `/settings/users` | ✅ só admin |
| `/settings/company`, `/settings/bdi` | ✅ redirect não-admin |

### APIs críticas sem `currentUserCanModule` (amostra)

- `/api/finance/credit-analysis/*` — autenticação/tenant; ⚠️ sem check módulo faturamento explícito na rota.
- Maioria de `/api/finance/*`, `/api/production/*`, `/api/products/*` — ⚠️ depender de RLS/perfil JSON legado.

### Problemas nesta secção: **12** (lacunas de guard em UI e APIs)

---

## 6. Código morto e lixo

| Tipo | Resultado |
|------|-----------|
| `// TODO` / `// FIXME` em `src/` | **0** |
| `console.log(` | **4 ficheiros** (`sales/quotes/route.ts`, `customers/route.ts`, `sales/quotes/new/page.tsx`, `boards/.../task-assigned.ts` usa fluxo de notificação) |
| `console.info` em event bus | 2 (intencional stub) |
| Imports comentados | ⚠️ Não contados globalmente |
| Ficheiros `.ts/.tsx` não importados | ⚠️ **Não analisado** (requer knip/ts-prune; fora do âmbito desta passagem) |
| Pastas vazias | `modules/expedicao`, `modules/qualidade`, `shared/config`, `shared/data` |

### Problemas nesta secção: **5**

---

## 7. Dependências (`package.json`)

### Possivelmente não usadas em `src/`

| Pacote | Evidência |
|--------|-----------|
| `zustand` | ⚠️ Declarado e mencionado no README; **0 imports em `src/`** |
| `eslint` | ⚠️ Em `devDependencies`; script `lint` chama só `type-check` — ESLint não corre no CI local padrão |

### Em uso (amostra confirmada)

| Pacote | Uso |
|--------|-----|
| `axios` | `focusnfe.service.ts` |
| `pdf-parse` | `engenharia/.../ai.service.ts` |
| `pdfkit` | PDFs de compras |
| `recharts` | dashboards / relatórios |
| `react-markdown` + `remark-gfm` | kanban / AI |
| `@dnd-kit/*` | kanban |
| `@anthropic-ai/sdk` | serviços AI |

### Possivelmente em falta no `.env.local.example`

| Variável | Usada em |
|----------|----------|
| `RESEND_API_KEY` | emails compras / boards |
| `NOTIFICATIONS_EMAIL_FROM` | emails |
| `NEXT_PUBLIC_APP_URL` | links em emails |
| Token Focus NFe | lido de config empresa/DB (não env global documentado) |

### Problemas nesta secção: **2** (+ 4 env vars não documentadas em §9)

---

## 8. Documentação

### Ficheiros em `docs/`

| Ficheiro | Estado |
|----------|--------|
| `INVENTARIO-CONSOLIDACAO.md` | ✅ Referência histórica válida (origem hd-erp); menciona monorepo **como fonte**, não como estado actual |
| `REVISAO-POS-CONSOLIDACAO.md` | Este documento |

### Desatualizados (raiz)

| Ficheiro | Problema |
|----------|----------|
| `README.md` | ⚠️ Fala em `npm install`, roadmap “Módulo 1 Kanban”, `src/components/ui`, **zustand** — não reflecte consolidação Fase 2/3 nem `pnpm` |

### Sugestão de remoção

- **Não apagar** `INVENTARIO-CONSOLIDACAO.md` (auditoria útil).
- **Actualizar** (não apagar) `README.md` pós-deploy.

### Problemas nesta secção: **2**

---

## 9. Riscos para deploy

| Risco | Severidade | Detalhe |
|-------|------------|---------|
| Sem `.env.example` na raiz | ⚠️ Média | Existe `.env.local.example` (bom), mas pipelines podem procurar `.env.example` |
| Env de email não documentadas | ⚠️ Média | `RESEND_API_KEY`, `NOTIFICATIONS_EMAIL_FROM`, `NEXT_PUBLIC_APP_URL` |
| Guards de rota incompletos | 🔴 Alta | URL directa a módulos sem permissão (ex. `/sales/quotes`) |
| Middleware só auth | ⚠️ Média | Não valida `enabled_modules` no edge |
| `next.config.js` | ✅ Baixa | Sem `output: standalone` (comentado para Vercel); `outputFileTracingRoot` definido |
| Hardcodes de URL | ✅ Baixa | Focus NFe URLs fixas por ambiente (esperado); Supabase via env |
| `SUPABASE_PROJECT_ID` no example | ⚠️ Script `supabase:types` usa `--linked`; variável pode ser redundante |
| Hydration warnings | ⚠️ Baixa | Observado em dev no layout (não bloqueia build) |

### Problemas nesta secção: **4** (contando guards como risco deploy principal)

---

## 10. Resumo executivo

### Estado geral: **Atenção**

- **Build/types:** OK (`pnpm type-check` limpo).
- **Fase 3:** entregue e migrada no Supabase remoto ligado.
- **Auth/menu:** corrigido e validado para member restrito; **ainda faltam guards uniformes** em muitas rotas de vendas/finance/production.
- **Estrutura modular:** sólida no núcleo (`core`, `vendas`, `compras`, `shared`); placeholders vazios e UI ainda em `src/components/`.

### Top 5 problemas a corrigir antes de deploy

1. **Guards de rota em Vendas** — `/sales/quotes` (e listagens relacionadas) sem redirect como `/sales/orders`.
2. **Guard em `/finance/credit-analysis`** — página e APIs alinhadas a `can("finance")` / módulo `faturamento`.
3. **Protecção consistente em Compras/Produção** — listagens principais (`/purchasing/orders`, `/production/orders`).
4. **README + env example** — documentar `pnpm`, variáveis Resend/App URL, estado pós-consolidação.
5. **Clarificar RBAC** — `role_permissions` (R2) vs `rbac_*` legado para evitar perfis contradictórios.

### Top 5 melhorias recomendadas pós-deploy

1. Middleware ou layout guard genérico por prefixo de rota (`/sales/*` → `sales`, etc.).
2. Completar migração de `src/components/*` para `src/modules/<domínio>/components` onde fizer sentido.
3. Preencher `modules/expedicao` e `modules/qualidade` ou remover placeholders até haver código.
4. Event bus: handlers reais (PCP pós-crédito aprovado) em vez de stubs.
5. Adicionar `knip` ou `ts-prune` no CI para código morto e dependências órfãs.

---

**Tamanho deste ficheiro:** ~13,5 KB · **208 linhas**  
**Revisão:** somente leitura; nenhum ficheiro de aplicação foi modificado durante a geração deste relatório.
