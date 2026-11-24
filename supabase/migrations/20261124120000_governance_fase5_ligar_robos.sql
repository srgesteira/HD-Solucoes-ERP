-- Fase 5 — Ligar os robôs prontos.
-- Faturista e Comprador passam a 'ativo': NF-e e pedido de compra pedidos por robô só executam
-- com pedido APROVADO na fila (trava nas rotas /api/agent/faturar e /api/agent/comprador).
-- Anotações e Carteira também passam a 'ativo'. Pausar continua sendo 1 toque na tela /aprovacoes.
begin;

update public.agents
   set status = 'ativo'
 where slug in ('faturista', 'comprador', 'anotacoes', 'carteira')
   and status = 'pausado';

insert into public.agent_audit_log (tenant_id, agent_id, actor, action, input, result, outcome)
select a.tenant_id, a.id, 'sistema', 'agents.retomar',
       jsonb_build_object('motivo', 'Fase 5: ligar robôs prontos'),
       jsonb_build_object('status', a.status), 'ok'
  from public.agents a
 where a.slug in ('faturista', 'comprador', 'anotacoes', 'carteira');

commit;
