-- Norma v1.2, item 4 (instrumentar o ERP para o P90). actual_delivery continua = data de REGISTRO no ERP.
alter table public.purchase_orders
  add column if not exists etapa text check (etapa in ('chapa','chapa_com_solda','pintura','compra')),
  add column if not exists data_chegada_fisica date,
  add column if not exists chegada_parcial boolean not null default false,
  add column if not exists calculavel boolean not null default true;

comment on column public.purchase_orders.actual_delivery is 'Data de REGISTRO do recebimento no ERP (nao e a chegada fisica).';
comment on column public.purchase_orders.data_chegada_fisica is 'Dia em que a mercadoria chegou de fato (preenchido pelo comprador no dia). Se parcial: dia da ultima entrega que fechou o pedido.';
comment on column public.purchase_orders.calculavel is 'Entra no P90. false para todo pedido anterior a 28/11/2026 (data de chegada nao confiavel).';

-- Pedidos antigos: fora do P90.
update public.purchase_orders set calculavel = false where created_at < '2026-11-28';

-- Historico de etapa e chegada fisica; etapa travada depois da chegada.
create table if not exists public.purchase_orders_hist (
  id bigserial primary key,
  purchase_order_id uuid not null,
  campo text not null,
  de text,
  para text,
  em timestamptz not null default now()
);
alter table public.purchase_orders_hist enable row level security;

create or replace function public.po_etapa_chegada_guard() returns trigger language plpgsql as $$
begin
  if new.etapa is distinct from old.etapa then
    if old.data_chegada_fisica is not null and old.etapa is not null then
      raise exception 'Etapa nao pode mudar depois da chegada fisica (pedido %).', old.po_number;
    end if;
    insert into public.purchase_orders_hist (purchase_order_id, campo, de, para) values (old.id, 'etapa', old.etapa, new.etapa);
  end if;
  if new.data_chegada_fisica is distinct from old.data_chegada_fisica then
    insert into public.purchase_orders_hist (purchase_order_id, campo, de, para) values (old.id, 'data_chegada_fisica', old.data_chegada_fisica::text, new.data_chegada_fisica::text);
  end if;
  if new.status = 'partial' and old.status is distinct from 'partial' then
    new.chegada_parcial := true;
  end if;
  return new;
end $$;

drop trigger if exists trg_po_etapa_chegada_guard on public.purchase_orders;
create trigger trg_po_etapa_chegada_guard before update on public.purchase_orders
  for each row execute function public.po_etapa_chegada_guard();
