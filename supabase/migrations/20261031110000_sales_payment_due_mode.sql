-- Plano de pagamento: prazo a partir da emissão da NF-e, ou datas fixas escolhidas.
alter table public.sales_orders
  add column if not exists payment_due_mode text not null default 'from_emission',
  add column if not exists payment_fixed_due_dates date[] not null default '{}';

alter table public.quotes
  add column if not exists payment_due_mode text not null default 'from_emission',
  add column if not exists payment_fixed_due_dates date[] not null default '{}';

alter table public.sales_orders
  drop constraint if exists sales_orders_payment_due_mode_check;
alter table public.sales_orders
  add constraint sales_orders_payment_due_mode_check
  check (payment_due_mode in ('from_emission', 'fixed_dates'));

alter table public.quotes
  drop constraint if exists quotes_payment_due_mode_check;
alter table public.quotes
  add constraint quotes_payment_due_mode_check
  check (payment_due_mode in ('from_emission', 'fixed_dates'));

comment on column public.sales_orders.payment_due_mode is
  'from_emission = N dias a contar da data de emissão da NF-e; fixed_dates = vencimentos manuais.';
comment on column public.sales_orders.payment_fixed_due_dates is
  'Datas de vencimento quando payment_due_mode = fixed_dates.';
