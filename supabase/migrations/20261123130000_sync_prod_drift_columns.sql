-- Sincroniza colunas que existem na PRODUÇÃO mas foram criadas fora das migrations
-- (detectadas em 23/11/2026 comparando o schema public de produção × homologação).
-- Tipos, padrões e obrigatoriedade copiados da produção. Na produção é um no-op
-- (ADD COLUMN IF NOT EXISTS); serve para a homologação e para o histórico.
-- Fora do escopo (legado congelado, ver docs/RBAC-DECISAO.md): rbac_*, password_reset_tokens,
-- v_users, user_has_permission(), user_permission_names().
begin;

-- Contas a receber: previsão × real, parcela e origem
alter table public.receivables
  add column if not exists is_forecast boolean not null default true,
  add column if not exists installment_index integer,
  add column if not exists source_kind text not null default 'sales_order';

comment on column public.receivables.is_forecast is
  'Título gerado automaticamente a partir do pedido (previsão)';

-- Bloqueio financeiro em pedidos de venda e de compra
alter table public.sales_orders
  add column if not exists finance_blocked boolean not null default false,
  add column if not exists finance_blocked_at timestamptz,
  add column if not exists finance_blocked_reason text;

comment on column public.sales_orders.finance_blocked is
  'Bloqueio financeiro — oculta do PCP se sem operação iniciada';

alter table public.purchase_orders
  add column if not exists finance_blocked boolean not null default false,
  add column if not exists finance_blocked_at timestamptz,
  add column if not exists finance_blocked_reason text;

-- Observações Comercial ↔ PCP no pedido de venda
alter table public.sales_orders
  add column if not exists comercial_pcp_observation text,
  add column if not exists comercial_pcp_observation_at timestamptz,
  add column if not exists comercial_pcp_observation_by uuid,
  add column if not exists pcp_reply_comercial_observation text,
  add column if not exists pcp_reply_comercial_observation_at timestamptz,
  add column if not exists pcp_reply_comercial_observation_by uuid;

-- Limite de crédito do fornecedor
alter table public.suppliers
  add column if not exists credit_limit numeric;

notify pgrst, 'reload schema';
commit;
