# ERP HD Soluções Industriais

Sistema corporativo da **HD Projetos & Soluções em HVAC**, construído de forma
modular sobre Next.js 16 + Supabase.

> Este repositório nasceu como uma cópia do **PCP Control** (sistema multi-tenant
> que serve a HEPA Filtros Industriais) e está sendo evoluído módulo a módulo
> até se tornar um ERP completo.

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Supabase** (PostgreSQL + Auth + Storage + Realtime)
- **TailwindCSS 3** + componentes UI próprios em `src/components/ui`
- **@dnd-kit** para drag-and-drop, **@tanstack/react-query** para cache de
  dados, **zustand** para estado leve do board ativo
- **Sonner** para toasts, **lucide-react** para ícones
- **Vercel** para deploy

## Roadmap por módulos

1. **Módulo 1 — Agendador de Tarefas (Kanban)** ← **em desenvolvimento**
2. Módulo 2 — Cadastro de Produtos (SKUs + BOM)
3. Módulo 3 — Cadastro de Clientes/Fornecedores
4. Módulo 4 — Pedidos de Venda
5. Módulo 5 — Pedidos de Compra
6. Módulo 6 — Ordens de Produção (integra com PCP Control)

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.local.example .env.local
# preencha as credenciais do projeto Supabase "erp-hd-solucoes"

# 3. Subir o ambiente de desenvolvimento
npm run dev
```

A aplicação fica disponível em http://localhost:3000.

## Estrutura de pastas

```
src/
├── app/
│   ├── (auth)/login/        # Login com Supabase Auth
│   ├── (app)/               # Área autenticada (sidebar + topbar)
│   │   ├── boards/          # [Módulo 1] Quadros Kanban
│   │   └── settings/        # [futuro] Perfil e preferências
│   ├── api/                 # Route handlers (criados sob demanda)
│   ├── layout.tsx           # Layout raiz (Toaster + metadata)
│   └── page.tsx             # Redirect → /boards
├── components/
│   ├── layout/app-shell.tsx # Sidebar + topbar autenticado
│   └── ui/                  # button, card, input, label, …
├── lib/
│   ├── supabase/            # client, server, admin (com SERVICE_ROLE)
│   ├── types/database.ts    # gerado por `npm run supabase:types`
│   └── utils/               # constants, cn, date helpers
└── middleware.ts            # auth gate (Supabase SSR)
```

## Tenancy

Multi-tenant desde o dia 1: todas as tabelas terão `tenant_id`. Inicialmente o
sistema opera com um único tenant — `hd-interna` (HD Soluções Industriais —
Interno). Veja `src/lib/utils/constants.ts` (`DEFAULT_TENANT_SLUG`).

## Convenções

- **Server Components por padrão.** Use `'use client'` somente quando precisar
  de interatividade.
- **Validação:** todo endpoint deve validar payload com **Zod**.
- **Erros:** usar `toast.error()` em português claro.
- **Mobile-first.** Kanban deve ter scroll horizontal nas colunas em telas
  pequenas.
- **Acessibilidade:** todo botão precisa de `aria-label`, todo input precisa
  de `<label>` associado.
- **Sem `any`.** Usar tipos gerados do Supabase.
- **Cache no Vercel:** páginas com dados do usuário devem usar
  `export const dynamic = 'force-dynamic'`.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento Next.js |
| `npm run build` | Build de produção |
| `npm run start` | Servir build de produção |
| `npm run lint` | Lint via `next lint` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run supabase:types` | Regenera `src/lib/types/database.ts` (requer `SUPABASE_PROJECT_ID` no `.env.local` e CLI `supabase` instalada) |

## Status

- [x] Passo 0 — Limpeza inicial da pasta clonada (PCP Control → ERP HD)
- [ ] Passo 1 — Provisionar projeto Supabase `erp-hd-solucoes`
- [ ] Passo 2 — Aplicar schema SQL do Módulo 1
- [ ] Passo 3 — Estrutura de pastas / route groups
- [ ] Passo 4 — Bibliotecas de runtime (`@dnd-kit`, react-query, etc.)
- [ ] Passo 5 — Sprints de implementação (1 → 5)
