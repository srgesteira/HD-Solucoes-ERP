-- Fase 4 / Módulo C — Log de ações dos robôs.
-- Nome agent_audit_log porque public.audit_log já existe (trilha de alterações
-- das tabelas, migration 20260925110000) e tem outro formato.
-- Somente inclusão. Acesso só pelas rotas /api/audit (service_role).
begin;

create table public.agent_audit_log (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  agent_id     uuid references public.agents(id) on delete restrict,
  actor        text not null default 'robo' check (actor in ('robo','claude','diretor','sistema')),
  action       text not null,
  input        jsonb,
  result       jsonb,
  outcome      text not null check (outcome in ('ok','erro','recusado','ignorado')),
  duration_ms  integer check (duration_ms >= 0),
  error        text,
  approval_id  uuid references public.approvals(id) on delete restrict,
  created_at   timestamptz not null default now(),
  constraint agent_audit_log_error_required check (outcome not in ('erro','recusado') or error is not null)
);

comment on table  public.agent_audit_log is 'Log de ações dos robôs (Módulo C). Somente inclusão. Nunca gravar senha, token ou chave.';
comment on column public.agent_audit_log.outcome is 'recusado = rota bloqueou (17h30, robô pausado, limite por hora, token revogado).';
comment on column public.agent_audit_log.error is 'Motivo do erro ou da recusa.';

create index agent_audit_log_tenant_created_idx on public.agent_audit_log (tenant_id, created_at desc);
create index agent_audit_log_agent_created_idx  on public.agent_audit_log (agent_id, created_at desc);
create index agent_audit_log_problems_idx       on public.agent_audit_log (tenant_id, created_at desc)
  where outcome in ('erro','recusado');

create or replace function public.fn_agent_audit_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'agent_audit_log é somente inclusão (% bloqueado)', tg_op;
end $$;

create trigger trg_agent_audit_log_append_only
  before update or delete on public.agent_audit_log
  for each row execute function public.fn_agent_audit_log_append_only();

alter table public.agent_audit_log enable row level security;
revoke all on public.agent_audit_log from anon, authenticated;

notify pgrst, 'reload schema';
commit;
