-- Fase 4 / Módulo D — Registro dos robôs.
-- Acesso só pelas rotas da API (service_role): RLS ligado e nenhuma policy.
begin;

create or replace function public.fn_governance_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.agents (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete restrict,
  slug                  text not null,
  name                  text not null,
  role                  text not null,
  window_start          time not null default '07:00',
  window_end            time not null default '18:00',
  max_actions_per_hour  integer not null default 60 check (max_actions_per_hour > 0),
  token_hash            text,
  token_rotated_at      timestamptz,
  last_seen_at          timestamptz,
  status                text not null default 'ativo'
                        check (status in ('ativo','pausado','erro')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint agents_tenant_slug_key unique (tenant_id, slug),
  constraint agents_token_hash_key  unique (token_hash),
  constraint agents_window_check    check (window_start < window_end)
);

comment on table  public.agents is 'Registro dos robôs (Módulo D). Acesso só pelas rotas /api/agents e /api/agent/*.';
comment on column public.agents.slug is 'Identificador fixo do robô (ex.: auditor), igual ao usado no n8n e em robot_heartbeats.robot.';
comment on column public.agents.window_start is 'Início da janela permitida (horário de São Paulo).';
comment on column public.agents.window_end is 'Fim da janela permitida (horário de São Paulo).';
comment on column public.agents.max_actions_per_hour is 'Limite de ações por hora, aplicado no servidor.';
comment on column public.agents.token_hash is 'Hash do token do robô. O token em si nunca é gravado.';
comment on column public.agents.last_seen_at is 'Último sinal de vida recebido.';
comment on column public.agents.status is 'pausado = killswitch: as rotas do robô recusam na hora.';

create trigger trg_agents_updated_at
  before update on public.agents
  for each row execute function public.fn_governance_set_updated_at();

alter table public.agents enable row level security;
revoke all on public.agents from anon, authenticated;

notify pgrst, 'reload schema';
commit;
