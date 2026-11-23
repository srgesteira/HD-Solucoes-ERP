-- Fase 4 / Módulo D — carga inicial do registro dos robôs.
-- Slugs iguais aos usados no n8n (header x-robo) e em robot_heartbeats.robot.
-- Robôs que ainda não estão ligados (Fase 5) entram pausados.
-- Pode rodar de novo sem duplicar (on conflict do nothing). Sem tokens: cada token é gerado
-- pela rota POST /api/agents/{slug} {acao:"novo_token"} e só o hash fica no banco.
begin;

insert into public.agents (tenant_id, slug, name, role, status, window_start, window_end, max_actions_per_hour)
select t.id, r.slug, r.name, r.role, r.status, r.window_start::time, r.window_end::time, r.max_per_hour
from public.tenants t
cross join (values
  ('n8n',           'Heartbeat do n8n', 'Sinal de vida a cada 10 min',                'ativo',   '00:00', '23:59:59', 20),
  ('auditor',       'Auditor',          'Resumo das 8h e captura de erros (piloto)',  'ativo',   '07:00', '18:00',    60),
  ('supervisor',    'Supervisor',       'Resumo de saúde 8h05',                       'ativo',   '07:00', '18:00',    60),
  ('recepcionista', 'Recepcionista',    'Triagem de e-mails',                         'ativo',   '07:00', '18:00',   120),
  ('financeiro',    'Financeiro',       'Extrato e conciliação',                      'ativo',   '07:00', '18:00',    60),
  ('cobrador',      'Cobrador',         'Cobra comprovantes 12h/15h/16h/17h',         'ativo',   '07:00', '18:00',    30),
  ('pcp',           'PCP',              'Pedidos que vão atrasar, 7h30',              'ativo',   '07:00', '18:00',    60),
  ('notificador',   'Notificador',      'Avisos',                                     'ativo',   '07:00', '18:00',    60),
  ('prospector',    'Prospector',       'Prospecção com modelos aprovados (15/dia)',  'ativo',   '07:00', '18:00',    30),
  ('faturista',     'Faturista',        'NF-e via Bling (Fase 5)',                    'pausado', '07:00', '17:30',    20),
  ('comprador',     'Comprador',        'Compras ligadas ao PV (Fase 5)',             'pausado', '07:00', '17:30',    30),
  ('anotacoes',     'Anotações',        'Orçamentos em aberto (Fase 5)',              'pausado', '07:00', '18:00',    60),
  ('carteira',      'Carteira',         'Pedidos em aberto (Fase 5)',                 'pausado', '07:00', '18:00',    60)
) as r(slug, name, role, status, window_start, window_end, max_per_hour)
on conflict (tenant_id, slug) do nothing;

commit;
