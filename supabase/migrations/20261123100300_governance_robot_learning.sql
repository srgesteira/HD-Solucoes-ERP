-- Fase 4 / Módulo E — Banco de aprendizado dos robôs.
-- Acesso só pelas rotas /api/learning (service_role): RLS ligado e nenhuma policy.
begin;

create table public.robot_learning (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete restrict,
  agent_id           uuid not null references public.agents(id) on delete restrict,
  context            text not null,
  original_question  text not null,
  approved_answer    jsonb not null,
  source             text not null check (source in ('claude','diretor')),
  risk               text not null default 'baixo' check (risk in ('baixo','medio','alto')),
  approval_id        uuid references public.approvals(id) on delete restrict,
  last_confirmed_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Regra de ouro 1: resposta do Claude para ação de risco Alto só vira regra com OK do diretor
  constraint robot_learning_high_risk_needs_ok
    check (not (source = 'claude' and risk = 'alto' and approval_id is null))
);

comment on table  public.robot_learning is 'Banco de aprendizado (Módulo E). Só decisões do Claude ou do diretor, nunca texto copiado de e-mail. A regra ensina quem/qual; a ação segue a matriz de risco.';
comment on column public.robot_learning.context is 'Assunto da regra (ex.: fornecedor_item) + chave (ex.: SKU).';
comment on column public.robot_learning.risk is 'Risco da ação ligada à regra; alto + claude exige approval_id.';
comment on column public.robot_learning.last_confirmed_at is 'Regra de ouro 3: sem confirmação há mais de 6 meses, expira.';

create unique index robot_learning_key on public.robot_learning (tenant_id, agent_id, context);

create trigger trg_robot_learning_updated_at
  before update on public.robot_learning
  for each row execute function public.fn_governance_set_updated_at();

-- Regras válidas (confirmadas nos últimos 6 meses). O robô consulta só esta view.
create view public.robot_learning_valid
with (security_invoker = true) as
  select * from public.robot_learning
  where last_confirmed_at > now() - interval '6 months';

comment on view public.robot_learning_valid is 'Regras dentro do prazo de 6 meses. Fora dela, o robô volta a perguntar.';

alter table public.robot_learning enable row level security;
revoke all on public.robot_learning from anon, authenticated;
revoke all on public.robot_learning_valid from anon, authenticated;

notify pgrst, 'reload schema';
commit;
