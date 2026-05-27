# RBAC — inventário e decisão (`role_permissions` vs `rbac_*`)

**Data:** 2026-05-27  
**Estado:** documentação apenas — **nada foi removido** do código ou da base de dados.

## Resumo executivo

| Modelo | Tabelas | Usado pelo app hoje? | Recomendação |
|--------|---------|----------------------|--------------|
| **R2 / Speed Air (novo)** | `role_permissions` + colunas `user_profiles.enabled_modules`, `role_keys` | **Sim** — fonte activa | **Manter como modelo operacional** |
| **RBAC legado (hd-erp)** | `rbac_roles`, `rbac_permissions`, `rbac_role_permissions`, `rbac_user_roles` | **Não** — só tipos gerados + FK de ponte | **Congelar** (não usar em código novo); desactivar só após migração de dados se ainda houver linhas em produção |

O controlo de acesso efectivo no monolito consolidado é:

1. `user_profiles.role` (`admin` → `["*"]`)
2. `user_profiles.enabled_modules` (chaves PT: `vendas`, `compras`, `faturamento`, …)
3. Fallback: `user_profiles.permissions` (JSON legado `ModuleKey` em inglês)
4. Catálogo de cargos R2: `role_permissions` (preenche `enabled_modules` via UI admin)

---

## 1. `role_permissions` (modelo R2 — activo)

### Esquema (migration local)

- `supabase/migrations/20260827120000_user_module_access.sql` — cria tabela e colunas em `user_profiles`
- `supabase/migrations/20260827120100_role_permissions_seed.sql` — seed dos 30 cargos Speed Air R2

### Colunas relevantes

- `role_key`, `role_name`, `module_key`, `permissions` (JSON legado por cargo)
- `module_keys` (`TEXT[]`) — lista PT alinhada ao menu (`vendas`, `pcp`, …)

### Onde o código lê/escreve

| Ficheiro | Uso |
|----------|-----|
| `src/app/api/role-permissions/route.ts` | `GET` — lista cargos para dropdown (apenas admin) |
| `src/app/api/users/[id]/module-access/route.ts` | `PUT` — ao escolher `role_key`, copia `module_keys` → `user_profiles.enabled_modules` |
| `src/app/(app)/settings/users/page.tsx` | UI de gestão de acesso (consome as APIs acima) |
| `src/modules/core/types/database.ts` | Tipos gerados (`role_permissions` Row/Insert) |

### Fluxo runtime (não consulta a tabela em cada request)

1. Admin atribui cargo → grava `enabled_modules` + `role_keys` no perfil.
2. Middleware (`src/middleware.ts` + `route-module-guard.ts`) e APIs (`currentUserCanModule` / `currentUserCanMenuModule`) leem **só** `user_profiles`.

---

## 2. `rbac_*` (modelo legado — inactivo no app)

### Tabelas (existem no Supabase remoto; tipos em `database.ts`)

- `rbac_roles` — inclui `legacy_role_key` → FK para `role_permissions.role_key` (ponte documentada no schema)
- `rbac_permissions`
- `rbac_role_permissions`
- `rbac_user_roles`

### Onde o código referencia

| Local | Uso real |
|-------|----------|
| `src/modules/core/types/database.ts` | Apenas definições TypeScript geradas por `pnpm supabase:types` |
| **Nenhum** `src/app/api/**`, hooks, middleware ou componentes | **Zero queries** a `rbac_*` |

### Migrations neste repositório

- **Não há** ficheiros `.sql` em `supabase/migrations/` que criem ou alterem `rbac_*` (herança de instância / projeto hd-erp anterior).

---

## 3. Camada de aplicação (independente das tabelas RBAC)

| Mecanismo | Ficheiro(s) | Notas |
|-----------|-------------|-------|
| Menu / portal | `src/shared/auth/menu-modules.ts`, `app-shell.tsx` | `userHasModule`, `enabled_modules` |
| APIs | `src/modules/core/lib/tenant.ts` | `currentUserCanModule`, `currentUserCanMenuModule` |
| APIs (legado) | `src/modules/core/lib/module-access.ts` | `assertModuleAccess` — agora delega em `currentUserCanModule` |
| Rotas UI | `src/middleware.ts` | Guard por prefixo → `?denied=` em `/home` |
| Perfil | `src/modules/core/lib/profile-access.ts` | `loadProfileAccess` |

O JSON `user_profiles.permissions` continua como **fallback** quando `enabled_modules` está vazio (utilizadores antigos).

---

## 4. Recomendação (sem apagar nada ainda)

### Manter

- **`role_permissions`** como catálogo de cargos R2 e origem de `module_keys`.
- **`user_profiles.enabled_modules`** como fonte de verdade em runtime.
- **`user_profiles.permissions`** até todos os perfis migrarem para `enabled_modules` explícito.

### Congelar (não expandir)

- **`rbac_*`**: não implementar novas features sobre estas tabelas.
- Se no futuro for preciso “desactivar o outro”:
  1. Confirmar em produção: `SELECT count(*) FROM rbac_user_roles` (e roles activos).
  2. Migrar atribuições restantes para `enabled_modules` / `role_keys`.
  3. Só então: RLS `DENY`, views read-only ou drop — **fora do âmbito actual**.

### Próximo passo sugerido (pós-validação destes commits)

- Script SQL de auditoria: utilizadores com `enabled_modules` vazio vs `rbac_user_roles` preenchido.
- Marcar `rbac_*` como `@deprecated` no README interno quando a auditoria estiver limpa.

---

## 5. Riscos se os dois modelos coexistirem sem regra

| Risco | Mitigação actual |
|-------|-------------------|
| Admin edita só `rbac_user_roles` e o app ignora | App **não lê** `rbac_*` — risco só se alguém usar ferramenta externa |
| `permissions` JSON contradiz `enabled_modules` | Com `enabled_modules` não vazio, o código **prioriza** `enabled_modules` (`menu-modules.ts`, `tenant.ts`) |
| Cargo R2 desactualizado no seed | Re-deploy de migration seed ou UPDATE manual em `role_permissions` |

---

## 6. Referências

- Revisão pós-consolidação: `docs/REVISAO-POS-CONSOLIDACAO.md` (item dual RBAC)
- Inventário migrations: `docs/INVENTARIO-CONSOLIDACAO.md`
- Migrations R2: `20260827120000_user_module_access.sql`, `20260827120100_role_permissions_seed.sql`
