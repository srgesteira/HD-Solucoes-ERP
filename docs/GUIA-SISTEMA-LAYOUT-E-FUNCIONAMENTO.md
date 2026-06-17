# Guia do sistema — o que faz, como faz e layout

**ERP HD Soluções Industriais** · Documento operacional e técnico  
**Última atualização:** junho/2026  
**Público-alvo:** equipa interna, novos utilizadores e desenvolvedores

**Índice rápido:** §1–3 visão e menu · §4–5 layout cronograma · §6 fluxos · §7–8 arquitetura · §9 convenções · **§12 roadmap (feito vs. pendente)**

---

## 1. Visão geral

O **HD Soluções ERP** é um sistema corporativo modular para a **HD Projetos & Soluções em HVAC**. Cobre o ciclo operacional de uma indústria: **orçamentar → vender → comprar → produzir → expedir → faturar → receber/pagar**.

### O que o sistema faz (em uma frase)

Centraliza cadastros, pedidos, produção, logística, financeiro e qualidade num único ambiente multi-tenant, com permissões por módulo e interface padronizada em formato **cronograma em linhas** nas listagens operacionais.

### Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, TailwindCSS |
| Backend / dados | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Estado cliente | TanStack Query, Zustand (boards Kanban) |
| Deploy | Vercel |

### Multi-tenant

Todas as tabelas relevantes têm `tenant_id`. Hoje opera com o tenant padrão **hd-interna** (HD Soluções — Interno). Cada utilizador pertence a um tenant e vê apenas os dados desse tenant (RLS + filtros nas APIs).

---

## 2. Como entrar e navegar

### Passo 1 — Autenticação

1. O utilizador acede a `/login`.
2. Faz login via **Supabase Auth** (e-mail + palavra-passe).
3. O `middleware.ts` protege a área `(app)`: sem sessão válida, redireciona para login.

### Passo 2 — Shell da aplicação

Após login, todas as páginas internas usam o **App Shell** (`src/components/layout/app-shell.tsx`):

```
┌─────────────────────────────────────────────────────────────┐
│  [≡]  HD Soluções ERP                    [utilizador] [↪]  │  ← Topbar
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   SIDEBAR    │              CONTEÚDO DA PÁGINA              │
│   (menu)     │         (AppPage + cronograma / cards)       │
│              │                                              │
│  Portal      │                                              │
│  Logística ▾ │                                              │
│  Vendas ▾    │                                              │
│  ...         │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Elementos fixos do shell:**

- **Sidebar esquerda** — menu agrupado por domínio (Logística, Vendas, Financeiro, etc.).
- **Topbar** — nome da app, menu mobile, perfil e logout.
- **Alertas no menu** — badges de urgência (vermelho pulsante = hoje/atrasado; âmbar = atenção).
- **Resumo no topo** — “X coisas urgentes hoje” quando há itens críticos.

### Passo 3 — Permissões (quem vê o quê)

O menu é filtrado por **módulos habilitados** no perfil do utilizador:

1. Admin vê tudo.
2. Membros têm `enabled_modules` (ex.: `sales`, `purchasing`, `finance`).
3. Cada item do menu exige um `module` ou `anyOf` (qualquer um de vários módulos).
4. Tentativa de aceder a rota sem permissão → redirect para `/home?denied=...` + toast.

Configuração de utilizadores: **Configurações → Utilizadores** (`/settings/users`).

### Passo 4 — Portal inicial

**Portal** (`/home`) mostra mini-dashboards por módulo que o utilizador pode aceder (KPIs via `/api/dashboard/kpis`). É o ponto de partida após login.

---

## 3. Mapa de módulos (menu lateral)

| Grupo / link | Rotas principais | Função |
|--------------|------------------|--------|
| **Portal** | `/home` | Resumo por módulo |
| **Dashboard Gerencial** | `/dashboard-gerencial` | Visão gerencial (reports/finance) |
| **Dashboard BI** | `/dashboard` | Indicadores BI |
| **Tarefas** | `/boards` | Quadros Kanban (agendador) |
| **Logística** | | |
| → PCP | `/logistics/pcp` | Planeamento e controle de produção |
| → Compras | `/purchasing/orders` | Pedidos de compra (referência de layout) |
| → Devoluções de compra | `/purchasing/returns` | Devoluções a fornecedores |
| → Fornecedores | `/purchasing/suppliers` | Cadastro de fornecedores |
| → Almoxarifado | `/logistics/warehouse` | Entrada/saída de estoque |
| → Expedição | `/logistics/shipping` | Remessas e envios |
| → Relatórios logísticos | `/logistics/reports` | Relatórios do domínio |
| **Produção** | OPs por linha, KPIs | Controle de chão de fábrica |
| **Qualidade** | Inspeções, NC | Recebimento, processo, liberação final |
| **Engenharia** | `/products` | Produtos, BOM, classificação |
| **RH** | Colaboradores, deptos, cargos | Gestão de pessoas |
| **Financeiro** | Receber, pagar, fluxo | Contas, crédito, dashboards |
| **Vendas** | Orçamentos, PV, clientes | Ciclo comercial |
| **Saúde do dado** | `/data-health` | Inconsistências e bloqueios |
| **Onboarding** | `/onboarding` | Checklist de configuração inicial |
| **Configurações** | Empresa, fiscal, utilizadores | Parâmetros do tenant |

---

## 4. Layout visual — padrão global

### 4.1 Container de página (`AppPage`)

Todas as páginas internas devem usar `AppPage` (`src/shared/ui/app-page.tsx`):

```
┌─────────────────────────────────────────────────────────────┐
│  ← Voltar (opcional)                                        │
│  Título da página                          [Ação] [Ação]    │
│  Subtítulo curto (opcional)                                 │
├─────────────────────────────────────────────────────────────┤
│  … conteúdo (abas, busca, tabela, cards) …                  │
└─────────────────────────────────────────────────────────────┘
```

**Larguras disponíveis:**

| `width` | Uso típico |
|---------|------------|
| `narrow` | Onboarding, formulários simples |
| `default` | Páginas gerais |
| `wide` | **Listagens operacionais (cronograma)** — max ~96rem |
| `full` | Dashboards amplos |

**Densidade:**

- `compact` — cabeçalho menor (`text-lg`), espaçamento reduzido (padrão).
- `comfortable` — título maior, mais respiro (ex.: Compras, Onboarding).

### 4.2 Padrão **Cronograma em linhas** (listagens)

Referência visual: **Logística → Compras** (`/purchasing/orders`).

Estrutura de uma listagem padronizada:

```
AppPage (width="wide")
  └── Abas por status (+ aba "Todos")
        └── CronogramaSearch (busca universal)
              └── SortableTable (density="cronograma")
                    └── Paginação (quando aplicável)
```

**Diagrama de camadas:**

```
┌─ AppPage ───────────────────────────────────────────────────┐
│  Título + botões (Novo, Importar, etc.)                     │
│  ┌─ Tabs ────────────────────────────────────────────────┐  │
│  │ [Abertos] [Finalizados] [Todos] [Requisições]         │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌─ Busca ───────────────────────────────────────────────┐  │
│  │ 🔍 Buscar por código, cliente, fornecedor, data…      │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌─ Tabela compacta ─────────────────────────────────────┐  │
│  │ Código │ Cliente │ Status │ Prazo │ Valor │ Ações     │  │
│  │────────┼─────────┼────────┼───────┼───────┼──────────│  │
│  │ PV-…   │ ACME    │ ● Aberto│ 15/07 │ R$…  │ [···]     │  │
│  └───────────────────────────────────────────────────────┘  │
│  « Anterior   Página 1 de 5   Próximo »                     │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Tokens visuais do cronograma

Definidos em `CRONOGRAMA_TOKENS` (`src/shared/ui/cronograma-layout.tsx`):

| Token | Aparência |
|-------|-----------|
| `cellText` | `text-xs text-slate-800` |
| `cellMuted` | `text-xs text-slate-700 tabular-nums` (números alinhados) |
| `cellLink` | `font-mono text-xs text-brand-700` (códigos clicáveis) |
| `badge` | Badge compacto com `ring-1` |
| `rowHover` | `hover:bg-slate-50/60` |

### 4.4 Tabela ordenável (`SortableTable`)

- Densidade **`cronograma`**: padding compacto, `text-xs`, ideal para muitas linhas.
- Colunas com **`width`** em percentagem (ex.: `w-[12%]`).
- Ordenação por clique no cabeçalho.
- Coluna de **ações** opcional à direita.

### 4.5 Componentes do kit cronograma

| Componente | Ficheiro | Função |
|------------|----------|--------|
| `CronogramaSearch` | `cronograma-layout.tsx` | Campo de busca com ícone e debounce (380 ms) |
| `useCronogramaSearch` | idem | Hook: `input`, `debounced`, `setInput` |
| `CronogramaTabs` / `CronogramaTabPanel` | idem | Abas responsivas (`flex-wrap`) |
| `CronogramaPanel` | idem | Agrupa busca + erro + tabela + footer |
| `CronogramaPagination` | idem | Navegação de páginas |
| `CronogramaError` / `CronogramaLoading` | idem | Estados de erro e carregamento |
| `InlineDateEdit` | `inline-date-edit.tsx` | Edição inline de datas (clique → date picker → PATCH) |

### 4.6 Busca universal

**Objetivo:** um único campo encontra registos por texto livre ou data.

**Como funciona:**

1. **Cliente** — `parseUniversalSearch()` aceita:
   - Texto livre (código, nome, produto…)
   - Datas: `dd/mm/aaaa`, `dd-mm-aaaa` ou `aaaa-mm-dd`
2. **Servidor** — APIs de pedidos (vendas/compras/orçamentos) expandem a busca para itens de linha (produto dentro do pedido).
3. **Filtro local** — `matchesUniversalSearchRow()` quando a API devolve conjunto completo.

**Placeholder padrão:**  
`"Buscar por código, cliente, fornecedor, data, produto…"`

### 4.7 Edição inline de datas

Em colunas de prazo (ex.: validade do orçamento, entrega do PV, prazo do PC):

1. Utilizador clica na data na tabela.
2. Abre seletor de data (`InlineDateEdit`).
3. Ao confirmar, chama **PATCH** na API correspondente.
4. A linha atualiza sem sair da listagem.

### 4.8 O que **não** usa cronograma (de propósito)

| Tipo de tela | Exemplo | Layout |
|--------------|---------|--------|
| Dashboards / KPIs | `/home`, `/finance/dashboard` | Cards e gráficos |
| Kanban | `/boards` | Colunas drag-and-drop |
| Formulários de detalhe | `/sales/orders/[id]` | Cards, secções, tabs internas |
| Configurações | `/settings/company` | Formulários em Card |
| Relatórios analíticos | `/reports/*` | Tabelas + filtros próprios |
| PCP board | `/logistics/pcp` | Vista de planeamento |

---

## 5. Telas já no padrão cronograma

| Módulo | Rota | Abas típicas |
|--------|------|--------------|
| Compras | `/purchasing/orders` | Abertos · Finalizados · **Todos** · Requisições |
| Orçamentos | `/sales/quotes` | Por status + **Todos** |
| Pedidos de venda | `/sales/orders` | Em aberto · Enviados · **Todos** · Cancelados |
| Clientes | `/customers` | Lista única com busca |
| Fornecedores | `/purchasing/suppliers` | Lista com busca |
| Produtos | `/products` | Lista com busca |
| OP Produção | `/production/orders` | Por status |
| Contas a receber | `/finance/receivables` | Por situação |
| Contas a pagar | `/finance/payables` | Por situação |
| Expedição | `/logistics/shipping` | Por status |
| Devoluções venda | `/sales/returns` | Por status |
| Devoluções compra | `/purchasing/returns` | Por status |
| RH Colaboradores | `/hr/employees` | Lista |
| RH Departamentos | `/hr/departments` | Lista |

---

## 6. Fluxos de negócio — passo a passo

### 6.1 Configuração inicial (Onboarding)

**Onde:** `/onboarding`

**O que faz:** Lista o que falta configurar para o tenant operar (empresa, fiscal, utilizadores, etc.). Não inventa dados — apenas guia.

**Passos para o administrador:**

1. Abrir **Onboarding**.
2. Concluir itens marcados como **Crítico** (blockers).
3. Opcionalmente itens **Recomendados**.
4. Barra de progresso indica % concluído.
5. Quando blockers = 0, o tenant está apto a operar transações críticas.

### 6.2 Cadastros base

**Ordem sugerida:**

1. **Configurações → Empresa** — dados cadastrais, regime.
2. **Configurações → Regras fiscais / BDI** — precificação e impostos.
3. **Engenharia → Produtos** — SKUs, BOM, liberação para venda.
4. **Vendas → Clientes** — clientes e condições.
5. **Logística → Fornecedores** — fornecedores e prazos.

### 6.3 Fluxo comercial (Vendas)

```
Orçamento → Aprovação → Pedido de Venda → Produção → Expedição → Faturamento → Receber
```

#### Passo 1 — Criar orçamento

1. **Vendas → Orçamentos** (`/sales/quotes`).
2. Clicar em **Novo orçamento** ou importar PDF (`/sales/upload-pdf`).
3. Preencher cliente, itens, impostos, validade.
4. Status inicial: **Rascunho** (`draft`).
5. Enviar ao cliente → **Enviado** (`sent`).
6. Cliente aprova → **Aprovado** (`approved`).

**Na listagem cronograma:** buscar por número, cliente, produto na linha; editar **validade** inline.

#### Passo 2 — Converter em pedido de venda

1. No orçamento aprovado, acionar **Gerar pedido de venda**.
2. Sistema cria PV com número `PV-AAAA-NNNN`.
3. Status do PV: **Pendente** → **Confirmado** (`confirmed`).

**Efeitos ao confirmar:**

- Dispara **análise de crédito** (se configurado).
- Pode gerar necessidades de compra / OP conforme regras do produto.

#### Passo 3 — Acompanhar pedido

1. **Vendas → Pedidos de venda** (`/sales/orders`).
2. Abas: em aberto, enviados, todos, cancelados.
3. Editar **prazo de entrega** inline na tabela.
4. Abrir detalhe do PV para alterações profundas (itens, observações).

**Status típicos do PV:**

| Status | Significado |
|--------|-------------|
| `pending` | Criado, aguardando confirmação |
| `confirmed` | Confirmado, entra no PCP/compras |
| `in_production` | Em produção |
| `shipped` | Expedido |
| `cancelled` | Cancelado (com regras se produção já iniciou) |

#### Passo 4 — Devolução de venda (fluxo reverso)

1. **Vendas → Devoluções de venda**.
2. Registrar devolução ligada ao PV.
3. Atualiza estoque e financeiro conforme regras.

### 6.4 Fluxo de compras

```
Requisição MRP → Pedido de compra → Recebimento → Almoxarifado → Contas a pagar
```

#### Passo 1 — Requisições

1. **Compras** → aba **Requisições**.
2. Requisições geradas pelo MRP/PCP ou manualmente.
3. Badge no menu indica requisições pendentes.

#### Passo 2 — Pedido de compra

1. **Compras** → aba **Abertos** (cronograma por prazo).
2. **Novo pedido de compra** (admin) ou converter requisição.
3. Informar fornecedor, itens, prazo de entrega, impostos.

**Abas da tela Compras:**

| Aba | Conteúdo |
|-----|----------|
| Abertos | PCs com entrega futura ou pendente |
| Finalizados | Recebidos / encerrados |
| **Todos** | Visão completa filtrável |
| Requisições | Demandas ainda não convertidas |

#### Passo 3 — Recebimento e NF-e

1. Receber material → **Almoxarifado**.
2. **Importar NF-e** (botão na tela Compras) → conciliação fiscal.
3. Gera ou atualiza **Contas a pagar**.

#### Passo 4 — Devolução de compra

1. **Devoluções de compra** — registar devolução ao fornecedor.
2. Ajusta estoque e contas.

### 6.5 Produção e PCP

```
PV confirmado → OP → Linhas de produção → CQ → Liberação → Expedição
```

1. **PCP** (`/logistics/pcp`) — planeia capacidade e datas.
2. **Produção → OPs** (`/production/orders`) — ordens de produção em cronograma.
3. Menu **Produção** inclui linhas dinâmicas (carregadas da API).
4. **Qualidade** — inspeções em recebimento, processo e liberação final.
5. **Não conformidades** — registo e tratamento.

### 6.6 Logística e expedição

1. **Expedição** (`/logistics/shipping`) — remessas, transportadoras, documentos.
2. Integração com fluxo de transporte (quando configurado).
3. Atualiza status do PV para expedido.

### 6.7 Financeiro

| Tela | Função |
|------|--------|
| Contas a receber | Títulos de clientes, recebimentos |
| Contas a pagar | Títulos de fornecedores, pagamentos |
| Fluxo de caixa | Entradas/saídas consolidadas |
| Análise de crédito | Aprovar/rejeitar crédito de clientes |
| Dashboard financeiro | KPIs do módulo |

**Origem dos títulos:** confirmação de PV, recebimento de NF-e, parcelas definidas no pedido.

### 6.8 Saúde do dado

**Onde:** `/data-health`

**O que faz:** Varre inconsistências (cadastros incompletos, referências quebradas, bloqueios operacionais).

**Como usar:**

1. Abrir a página — KPIs mostram total, blockers e warnings.
2. Cada issue tem severidade, módulo e link para corrigir.
3. Atualiza a cada 5 minutos (ou manualmente).

---

## 7. Como o sistema processa pedidos (camadas)

### 7.1 Frontend

```
Página (Client Component)
  → useQuery / fetch → API Route (/app/api/...)
  → validação Zod
  → Supabase (server) com tenant_id
  → resposta JSON → SortableTable / formulário
```

### 7.2 Backend (API Routes)

- Cada rota em `src/app/api/**/route.ts`.
- Valida payload com **Zod**.
- Usa cliente Supabase server-side (sessão do utilizador ou service role quando necessário).
- Erros devolvidos em português; UI mostra `toast.error()`.

### 7.3 Domínio modular

Lógica de negócio em `src/modules/`:

| Pasta | Domínio |
|-------|---------|
| `vendas` | Orçamentos, PV, devoluções |
| `compras` | PCs, requisições, board |
| `core` | Tenant, KPIs, onboarding, data-health |
| `engenharia` | Produtos |
| `pcp` | Planeamento |
| `producao` | Linhas e OPs |
| `faturamento` | NF-e, crédito |
| `rh` | Colaboradores |
| `boards` | Kanban |

UI específica permanece em `src/components/` e páginas em `src/app/(app)/`.

### 7.4 Eventos e auditoria

- **Event bus** (`src/shared/events/`) — publica eventos de domínio; grava em `event_log`.
- **Audit log** — alterações sensíveis registadas para rastreio.
- Triggers SQL em migrations Supabase para regras críticas (ex.: crédito ao confirmar PV).

---

## 8. Guia rápido para criar uma nova listagem cronograma

**Checklist para desenvolvedores:**

1. Envolver página em `<AppPage width="wide" …>`.
2. Definir abas de status + aba **`Todos`** quando fizer sentido.
3. Usar `useCronogramaSearch()` + `<CronogramaSearch />`.
4. Passar `search` debounced para a API (`?search=…`).
5. Renderizar `<SortableTable density="cronograma" />` com colunas `%`.
6. Usar tokens `CRONOGRAMA_TOKENS` para texto/códigos/badges.
7. Datas editáveis → `InlineDateEdit` + endpoint PATCH.
8. Paginação → `CronogramaPagination` se a API for paginada.
9. Expandir busca server-side se a entidade tiver linhas filhas (produtos).

**Referência de implementação:**  
`src/components/purchasing/purchasing-orders-page.tsx` + tabs em `open-orders-tab.tsx`.

---

## 9. Convenções de produto

- Interface em **português (PT-BR/PT)**.
- Mobile-first; tabelas com scroll horizontal em ecrãs pequenos.
- Server Components por padrão; `'use client'` só com interatividade.
- Sem `any` — tipos gerados do Supabase (`pnpm supabase:types`).
- Páginas com dados do utilizador: `export const dynamic = 'force-dynamic'`.

---

## 10. Documentos relacionados

| Documento | Conteúdo |
|-----------|----------|
| `README.md` | Setup local e estrutura inicial |
| **Este guia — §12** | Roadmap feito vs. pendente |
| **`docs/GUIA-EXECUCAO-CURSOR.md`** | Plano de execução fatia a fatia (Cursor) |
| `docs/REVISAO-POS-CONSOLIDACAO.md` | Auditoria técnica pós-consolidação |
| `docs/RBAC-DECISAO.md` | Modelo de permissões |
| `docs/RUNBOOK-BACKUP-E-INCIDENTES.md` | Operação e incidentes |
| `docs/INVENTARIO-CONSOLIDACAO.md` | Inventário de módulos |

---

## 11. Resumo visual — tipos de layout no ERP

```
┌─────────────────────────────────────────────────────────────┐
│                    TIPOS DE TELA NO ERP                     │
├─────────────────┬───────────────────────────────────────────┤
│ CRONOGRAMA      │ Listagens operacionais (Compras, PV,    │
│ (wide + tabela) │ clientes, financeiro, expedição…)        │
├─────────────────┼───────────────────────────────────────────┤
│ CARDS / KPI     │ Portal, dashboards, onboarding, saúde     │
├─────────────────┼───────────────────────────────────────────┤
│ KANBAN          │ Tarefas / boards                          │
├─────────────────┼───────────────────────────────────────────┤
│ FORMULÁRIO      │ Detalhe de pedido, settings, modais       │
├─────────────────┼───────────────────────────────────────────┤
│ BOARD PCP       │ Planeamento visual de produção            │
└─────────────────┴───────────────────────────────────────────┘
```

---

## 12. Roadmap — feito vs. pendente

**Última revisão:** junho/2026 (pós-frentes Cursor 1–7)  
**Metodologia:** cruzamento do plano funcional com o código em `src/` e migrations `20260922*`–`20260927120000`.

Esta secção não substitui o backlog de produto — indica o que **já existe no repositório**, o que está **parcial** e o que **ainda falta construir**, para evitar retrabalho.

### 12.1 Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Implementado no código — validar no browser se ainda não testado |
| ⚠️ | Parcial — base pronta, falta fechar spec ou operação |
| ❌ | Pendente de construção |
| 🧑‍💼 | Depende de decisão humana (contadora, Helder) — não é tarefa de dev |

### 12.2 Já feito — descartar da fila de construção

| Área | Estado | Evidência principal |
|------|--------|---------------------|
| Layout cronograma (listagens) | ✅ | `cronograma-layout.tsx`, 15 ecrãs migrados (§5) |
| Motor fiscal — **estrutura** | ✅ | `fiscal_rules`, `fiscal_rule_applications`, `resolveFiscalRule`, `fiscal_status` — migration `20260922100000` |
| Tela regras fiscais | ✅ | `/settings/fiscal-rules` — CRUD, simulador, fila “a rever” |
| Validade / revisão de regra | ✅ | `valid_from`/`valid_until`, `last_reviewed_at`, APIs `to-review` / `mark-reviewed` — migration `20260925100000` |
| Disparo fiscal na conversão | ✅ | `quote-convert.ts` → `applyFiscalToSalesOrderItems` |
| AR provisório + sync recebíveis | ✅ | `generateReceivablesForSalesOrder(..., { provisional: true })`, `syncReceivablesForSalesOrder` |
| Fluxo reverso | ✅ | `reverse/*-service.ts`, migration `20260925120000`, `/sales/returns`, `/purchasing/returns`, cancel OP |
| Auditoria de negócio | ✅ | `audit_log`, triggers, `AuditHistoryPanel`, `/api/audit-log` — migrations `20260925110000` + `20260925140000` |
| Saúde do dado | ✅ | `/data-health`, `loadDataHealthIssues`, alertas no menu |
| Onboarding (checklist) | ✅ | `/onboarding`, `loadOnboardingState` — guia; não provisiona tenant sozinho |
| Urgência no menu | ✅ | `menu-alerts.ts` + estilos `app-shell` (urgent / attention / info) |
| Transporte / expedição (base) | ✅ | `shipments`, `shipments-service`, `/logistics/shipping` — migration `20260925130000` |
| IA assistente NCM | ✅ | `/api/ai/suggest-ncm` no edit de produto |
| IA assistente inconsistências fiscais | ✅ | Scan determinístico + explicação IA em `/settings/fiscal-rules` — `/api/fiscal/inconsistencies` |
| Empenho automático (Frente 1) | ✅ | `inventory_reservations`, writers MRP/abastecimento/cancel/PV — migration `20260926100000` |
| `has_composition` consolidado (Frente 2) | ✅ | `sync-has-composition.ts`, backfill — migration `20260926110000` |
| Inbox Engenharia (Frente 3) | ✅ | `/engineering/inbox`, `engineering-demands.ts`, API `/api/engineering/demands` |
| Abas Entrega/Coleta (Frente 4) | ✅ | UI `/logistics/shipping` por `direction` outbound/inbound |
| Limpeza técnica (Frente 5) | ✅ | `format-brl.ts`, drop tabelas mortas — migration `20260927100000` |
| Roteiro N operações (Frente 6) | ✅ | `product_routing_steps`, `order_item_operations`, UI produto + OP |
| Conciliação bancária (Frente 7) | ✅ | `/finance/bank-reconciliation`, CSV/OFX, match auto/manual, baixa título |
| Runbook continuidade (doc) | ✅ | `docs/RUNBOOK-BACKUP-E-INCIDENTES.md` |

> **Nota:** itens ✅ ainda podem precisar de **smoke test no navegador** e de **migrations aplicadas no Supabase remoto** (`pnpm supabase db push` ou `migration list --linked`).

### 12.3 Parcial — não reconstruir; fechar lacuna

| Área | O que falta |
|------|-------------|
| Motor fiscal **operacional** | 🧑‍💼 Regras nascem vazias — contadora preenche CFOP/alíquotas. Dev: usar assistente de inconsistências + simulador. |
| Validação P1 comercial/financeiro | Código de conversão + AR + empenho + conciliação existe; falta **smoke manual** (orçamento → PV → AR → confirmar → sync → conciliar). |
| Validação frentes 1–7 no browser | Código completo; Helder valida empenho, inbox, expedição, roteiro, conciliação com baixa/reversão. |
| Continuidade testada | Runbook escrito; primeiro restore mensal e `RUNBOOK-BACKUP-LOG.md` ainda não executados. |
| Onboarding “dados-semente” | Checklist sim; provisionamento automático de tenant novo — não. |
| `rbac_*` legado | Mantido por decisão (`docs/RBAC-DECISAO.md`); auditar antes de dropar. |

### 12.4 Pendente de construção

> **Plano de execução (frentes 1–7):** concluído — ver [`docs/GUIA-EXECUCAO-CURSOR.md`](./GUIA-EXECUCAO-CURSOR.md).

| Prioridade | Item | Detalhe |
|------------|------|---------|
| — | **Smoke test browser** | Empenho MRP, inbox engenharia, expedição abas, roteiro→OP, conciliação com baixa/reversão |
| — | Validação P1 comercial/financeiro | Orçamento → PV → AR provisório → confirmar → sync recebíveis |
| 🧑‍💼 | Preencher `fiscal_rules` | Contadora usa simulador + assistente de inconsistências |
| 🧑‍💼 | Genérico vs. vertical HVAC | Decisão estratégica (Helder) |
| Opcional | Reordenar roteiro (drag-and-drop) | UX — API já suporta sequência |
| Opcional | Audit `rbac_*` | Antes de migration de drop |

#### Limpeza já feita (Frente 5)

- **Removido:** `goods_receipts`, `incoming_inspections`, `operator_lines`, `recurring_expenses`, `company_kpis`, `bi_forecasts`
- **Endpoints órfãos removidos:** `POST /api/sales/quotes/[id]/convert`, `POST /api/pcp/complete-item`
- **fmtBRL:** consolidado em `@/shared/utils/format-brl`
- **Mantido:** `rbac_*`, `picking_suggestions`, `holidays`

### 12.5 Ordem daqui para a frente

```
1. Smoke browser — frentes 1–7 + fluxos P1 (Helder)
        ↓
2. Contadora preenche fiscal_rules  🧑‍💼
        ↓
3. Primeiro restore mensal (runbook)  🧑‍💼
        ↓
4. Decisão vertical HVAC  🧑‍💼
```

**Princípio:** código das 7 frentes está feito — foco em validação operacional e decisões de negócio.

### 12.6 Migrations recentes (referência)

| Migration | Conteúdo |
|-----------|----------|
| `20260922100000_fiscal_rules_engine.sql` | Motor fiscal + `fiscal_rule_applications` |
| `20260925100000_fiscal_rules_review_tracking.sql` | Revisão e validade de regras |
| `20260925110000_audit_log.sql` | Trilha de auditoria |
| `20260925120000_reverse_flow_returns_and_cancellation.sql` | Devoluções + cancelamento OP |
| `20260925130000_shipments_module.sql` | Expedição / transporte |
| `20260925140000_audit_log_reapply_triggers.sql` | Triggers de auditoria |
| `20260926100000_inventory_reservations.sql` | Empenho rastreável (Frente 1) |
| `20260926110000_backfill_has_composition.sql` | Backfill `has_composition` (Frente 2) |
| `20260926120000_product_routing_operations.sql` | Roteiro produto + OP (Frente 6) |
| `20260926130000_bank_reconciliation.sql` | Conciliação bancária base (Frente 7) |
| `20260927100000_drop_dead_tables.sql` | Drop tabelas mortas (Frente 5) |
| `20260927110000_backfill_order_item_operations.sql` | Backfill operações OP |
| `20260927120000_bank_statement_applied_amount.sql` | Baixa título na conciliação |

---

*Este guia descreve o estado actual do repositório. Para alterações de layout, roadmap ou novos módulos, actualizar este documento na mesma PR.*
