-- Fase 4 / Ordem 3 — registra o alerta financeiro do ERP (cron das 7h na Vercel) como robô.
-- Ele deixa de mandar Telegram e passa a gravar em agent_audit_log (ação 'alerta_financeiro').
begin;

insert into public.agents (tenant_id, slug, name, role, status, window_start, window_end, max_actions_per_hour)
select t.id, 'alertas_financeiros', 'Alertas financeiros (ERP)',
       'Cron 7h na Vercel: caixa 90 dias, contas de hoje/amanhã, entregas e chegadas → log',
       'ativo', '00:00'::time, '23:59:59'::time, 10
from public.tenants t
on conflict (tenant_id, slug) do nothing;

commit;
