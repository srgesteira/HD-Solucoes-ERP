-- IE do destinatário: distingue contribuinte (CSOSN 101) de não contribuinte (CSOSN 102).
alter table public.customers
  add column if not exists state_registration text;

comment on column public.customers.state_registration is
  'Inscrição estadual do cliente. Com IE o Bling envia contribuinte=1; sem IE e consumo, contribuinte=9 + CSOSN 102.';
