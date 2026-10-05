-- Valores livres por parcela (sinal + saldo). Array vazio = divisão igual.

alter table public.quotes
  add column if not exists payment_installment_amounts numeric[] not null default '{}';

alter table public.sales_orders
  add column if not exists payment_installment_amounts numeric[] not null default '{}';

alter table public.purchase_orders
  add column if not exists payment_installment_amounts numeric[] not null default '{}';

comment on column public.quotes.payment_installment_amounts is
  'Valores (R$) de cada parcela. Vazio = repartir o total em partes iguais.';
comment on column public.sales_orders.payment_installment_amounts is
  'Valores (R$) de cada parcela. Vazio = repartir o total em partes iguais.';
comment on column public.purchase_orders.payment_installment_amounts is
  'Valores (R$) de cada parcela. Vazio = repartir o total em partes iguais.';
