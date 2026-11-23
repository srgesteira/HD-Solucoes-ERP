-- Fase 4 / Módulo B — Fila de aprovações.
-- Acesso só pelas rotas /api/approvals (service_role): RLS ligado e nenhuma policy.
begin;

create table public.approvals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  agent_id       uuid not null references public.agents(id) on delete restrict,
  kind           text not null check (kind in
                   ('compra','nfe','envio_cliente','pagamento','permissao_pc','excecao','pergunta')),
  summary        text not null check (char_length(summary) between 1 and 200),
  payload        jsonb not null default '{}'::jsonb,
  source_url     text,
  risk           text not null default 'alto' check (risk in ('baixo','medio','alto')),
  status         text not null default 'pendente'
                 check (status in ('pendente','aprovado','rejeitado','expirado')),
  decided_by     uuid references public.user_profiles(id) on delete restrict,
  decided_at     timestamptz,
  expires_at     timestamptz not null default
                 (((now() at time zone 'America/Sao_Paulo')::date + time '18:00')
                   at time zone 'America/Sao_Paulo'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint approvals_decision_consistency check (
       (status = 'pendente'                and decided_at is null and decided_by is null)
    or (status in ('aprovado','rejeitado') and decided_at is not null and decided_by is not null)
    or (status = 'expirado'                and decided_by is null)
  )
);

comment on table  public.approvals is 'Fila de aprovações (Módulo B). Acesso só pelas rotas /api/approvals.';
comment on column public.approvals.agent_id is 'Robô de origem.';
comment on column public.approvals.summary is 'Resumo em 1 linha, para a tela do celular.';
comment on column public.approvals.payload is 'Dados do pedido. Para permissao_pc: comando exato e motivo.';
comment on column public.approvals.source_url is 'Origem: link do e-mail ou documento.';
comment on column public.approvals.risk is 'Classe da matriz de risco, definida em código (nunca pela IA).';
comment on column public.approvals.expires_at is 'Regra das 18h: pendente vira expirado às 18h (SP) do dia em que nasceu.';
comment on column public.approvals.decided_by is 'Usuário que decidiu (login com MFA).';

create index approvals_pending_idx       on public.approvals (tenant_id, created_at desc) where status = 'pendente';
create index approvals_tenant_status_idx on public.approvals (tenant_id, status, created_at desc);
create index approvals_agent_idx         on public.approvals (agent_id, created_at desc);

create trigger trg_approvals_updated_at
  before update on public.approvals
  for each row execute function public.fn_governance_set_updated_at();

-- Decisão é definitiva: fora de 'pendente', não muda mais
create or replace function public.fn_approvals_lock_decided()
returns trigger language plpgsql as $$
begin
  if old.status <> 'pendente' then
    raise exception 'Aprovação % já está % e não pode ser alterada', old.id, old.status;
  end if;
  return new;
end $$;

create trigger trg_approvals_lock_decided
  before update on public.approvals
  for each row execute function public.fn_approvals_lock_decided();

alter table public.approvals enable row level security;
revoke all on public.approvals from anon, authenticated;

notify pgrst, 'reload schema';
commit;
