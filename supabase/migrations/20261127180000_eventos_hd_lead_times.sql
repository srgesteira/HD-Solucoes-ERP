-- Etapa 3.1 — fila única de eventos (eventos_hd) + prazos de fornecedor (lead_times)
-- RODAR PRIMEIRO NA HOMOLOGAÇÃO (hd-erp-homolog). Idempotente: pode rodar de novo sem estragar.
-- Mesmo padrão de approvals / agent_audit_log: RLS ligado e sem policy (só o ERP, com service role, acessa).
-- Desfazer: ver o fim do arquivo.

begin;

create table if not exists public.eventos_hd (
  id                 bigint generated always as identity primary key,
  tenant_id          uuid not null references public.tenants(id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  robo               text not null,                       -- pcp, financeiro, cobrador, recepcionista, auditor, notificador...
  tipo               text not null,                       -- alertas, pagar, cotacao, manha...
  severidade         text not null default 'medio'
                       check (severidade in ('critico','medio','baixo')),
  cliente            text,
  pv                 text,
  resumo             text not null,
  payload            jsonb not null default '{}'::jsonb,
  acao_necessaria    text,
  prazo              timestamptz,
  dedupe_key         text not null,                       -- ex.: pcp:PV-2026-0028:2026-11-27
  status             text not null default 'aberto'
                       check (status in ('aberto','em_atendimento','aguardando_helder','falha_hd_central','resolvido','expirado','descartado')),
  tentativas         integer not null default 0,
  origem             text,                                -- n8n workflow id / rota
  hd_central_sessao  text,
  -- contadores do push repetido (7.x): tempo útil seg–sex 7h–17h30, sem feriado
  aguardando_desde   timestamptz,
  ultimo_push_em     timestamptz
);

-- Um evento ABERTO por dedupe_key (vale também para dois envios ao mesmo tempo).
create unique index if not exists eventos_hd_dedupe_aberto
  on public.eventos_hd (tenant_id, dedupe_key)
  where status in ('aberto','em_atendimento','aguardando_helder','falha_hd_central');
create index if not exists eventos_hd_status on public.eventos_hd (tenant_id, status);
create index if not exists eventos_hd_prazo  on public.eventos_hd (prazo) where prazo is not null;

create or replace function public.fn_eventos_hd_touch() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.status = 'aguardando_helder' and (old.status is distinct from 'aguardando_helder') and new.aguardando_desde is null then
    new.aguardando_desde := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_eventos_hd_touch on public.eventos_hd;
create trigger trg_eventos_hd_touch before update on public.eventos_hd
  for each row execute function public.fn_eventos_hd_touch();

alter table public.eventos_hd enable row level security;

-- Prazos de fornecedor/etapa usados pelo PCP para a folga (não ficam fixos no código).
create table if not exists public.lead_times (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references public.tenants(id),
  fornecedor     text not null,          -- 'Aço Líder', 'Juselia', ...
  etapa          text not null,          -- 'chapa', 'chapa_com_solda', 'pintura', ...
  dias           integer not null check (dias >= 0),   -- dias úteis
  atualizado_em  timestamptz not null default now(),
  fonte          text not null default 'combinado+20%',
  unique (tenant_id, fornecedor, etapa)
);
alter table public.lead_times enable row level security;

-- Prazos iniciais = combinado + 20% (regra da folga do plano), para cada tenant existente.
insert into public.lead_times (tenant_id, fornecedor, etapa, dias, fonte)
select t.id, v.fornecedor, v.etapa, v.dias, 'combinado+20% (plano 26/11)'
from public.tenants t
cross join (values ('Aço Líder','chapa',6), ('Aço Líder','chapa_com_solda',12), ('Juselia','pintura',4)) as v(fornecedor, etapa, dias)
on conflict (tenant_id, fornecedor, etapa) do nothing;

commit;

-- Conferência (rodar depois):
-- select count(*) from public.eventos_hd;            -- 0
-- select fornecedor, etapa, dias from public.lead_times order by 1,2;
-- Teste de duplicata (deve dar erro de unique na 2ª linha):
-- insert into public.eventos_hd (tenant_id, robo, tipo, resumo, dedupe_key) select id,'teste','teste','t1','teste:1' from public.tenants limit 1;
-- insert into public.eventos_hd (tenant_id, robo, tipo, resumo, dedupe_key) select id,'teste','teste','t2','teste:1' from public.tenants limit 1;

-- DESFAZER:
-- drop table if exists public.eventos_hd; drop function if exists public.fn_eventos_hd_touch(); drop table if exists public.lead_times;
