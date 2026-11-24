-- Fase 4 / Ordem 4 — Fila de aprovações: decisão em lote, regra das 18h e robô HD Central.
--  * approvals.decision_note: motivo da rejeição (opcional).
--  * expires_at: pedido criado depois das 18h (SP) vale até as 18h do dia seguinte.
--  * fn_approvals_expire: pendente com prazo vencido vira 'expirado' (grava no log).
--  * fn_approvals_decide: aprova/rejeita vários de uma vez, numa transação, e grava no log quem decidiu.
--  * Robô 'hd_central' (Claude no PC): único que pode ensinar regras com fonte = 'claude'.
-- Acesso só pelas rotas (service_role); execute revogado de anon/authenticated.
begin;

alter table public.approvals add column if not exists decision_note text
  check (decision_note is null or char_length(decision_note) <= 500);
comment on column public.approvals.decision_note is 'Observação de quem decidiu (ex.: motivo da rejeição).';

-- Prazo: 18h de hoje (SP); se já passou das 18h, 18h de amanhã.
create or replace function public.fn_approvals_default_expiry()
returns timestamptz language sql stable as $$
  select (
    ((now() at time zone 'America/Sao_Paulo')::date
      + case when (now() at time zone 'America/Sao_Paulo')::time >= time '18:00' then 1 else 0 end
    ) + time '18:00'
  ) at time zone 'America/Sao_Paulo'
$$;

alter table public.approvals alter column expires_at set default public.fn_approvals_default_expiry();

-- Regra das 18h: pendente vencido vira expirado. Devolve quantos expiraram.
create or replace function public.fn_approvals_expire(p_tenant uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with exp as (
    update public.approvals
       set status = 'expirado', decided_at = now()
     where tenant_id = p_tenant and status = 'pendente' and expires_at <= now()
    returning id, tenant_id, agent_id, kind, summary
  ), log as (
    insert into public.agent_audit_log (tenant_id, agent_id, actor, action, input, result, outcome, approval_id)
    select tenant_id, agent_id, 'sistema', 'aprovacao.expirada',
           jsonb_build_object('tipo', kind, 'resumo', summary),
           jsonb_build_object('status', 'expirado'), 'ok', id
      from exp
    returning 1
  )
  select count(*) into v_count from log;
  return coalesce(v_count, 0);
end $$;

-- Decisão em lote. Só mexe em pedidos pendentes e dentro do prazo; devolve o que mudou.
create or replace function public.fn_approvals_decide(
  p_tenant   uuid,
  p_ids      uuid[],
  p_decision text,
  p_user     uuid,
  p_note     text default null
)
returns table (id uuid, status text, summary text)
language plpgsql security definer set search_path = public as $$
begin
  if p_decision not in ('aprovado', 'rejeitado') then
    raise exception 'Decisão inválida: %', p_decision;
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Nenhum pedido informado';
  end if;
  if not exists (select 1 from public.user_profiles u where u.id = p_user and u.tenant_id = p_tenant) then
    raise exception 'Usuário não pertence ao tenant';
  end if;

  perform public.fn_approvals_expire(p_tenant);

  return query
  with dec as (
    update public.approvals a
       set status = p_decision,
           decided_by = p_user,
           decided_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where a.tenant_id = p_tenant
       and a.id = any (p_ids)
       and a.status = 'pendente'
    returning a.id, a.tenant_id, a.agent_id, a.kind, a.summary, a.status, a.decision_note
  ), log as (
    insert into public.agent_audit_log (tenant_id, agent_id, actor, action, input, result, outcome, approval_id)
    select d.tenant_id, d.agent_id, 'diretor', 'aprovacao.' || d.status,
           jsonb_build_object('tipo', d.kind, 'resumo', d.summary),
           jsonb_build_object('status', d.status, 'decidido_por', p_user, 'observacao', d.decision_note),
           'ok', d.id
      from dec d
    returning approval_id
  )
  select d.id, d.status, d.summary from dec d;
end $$;

revoke all on function public.fn_approvals_default_expiry() from public, anon, authenticated;
revoke all on function public.fn_approvals_expire(uuid) from public, anon, authenticated;
revoke all on function public.fn_approvals_decide(uuid, uuid[], text, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_approvals_default_expiry() to service_role;
grant execute on function public.fn_approvals_expire(uuid) to service_role;
grant execute on function public.fn_approvals_decide(uuid, uuid[], text, uuid, text) to service_role;

-- Robô HD Central (Claude chamado pelo n8n). Sem token: gerado pela tela de Aprovações.
insert into public.agents (tenant_id, slug, name, role, status, window_start, window_end, max_actions_per_hour)
select t.id, 'hd_central', 'HD Central (Claude)', 'Responde quando o robô não sabe; único que ensina regras com fonte = claude',
       'ativo', '07:00'::time, '18:00'::time, 60
from public.tenants t
on conflict (tenant_id, slug) do nothing;

notify pgrst, 'reload schema';
commit;
