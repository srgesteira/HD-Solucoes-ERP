-- Fase 4 / Ordem 5 — Banco de aprendizado: carga inicial "fornecedor de cada item".
-- Fonte: histórico de pedidos de compra que o ERP já tem (sem rascunho, cancelado ou sugestão).
-- Regra: para cada produto, o fornecedor do PC mais recente; fonte = 'diretor' (foi ele quem comprou),
-- ultima_confirmacao = data desse PC. Robô dono da regra: comprador.
-- Pode rodar de novo: atualiza a regra só se houver PC mais novo; nunca apaga regra editada à mão
-- (regras de fonte 'diretor' criadas na tela são sobrescritas só por um PC mais recente).
begin;

create or replace function public.fn_robot_learning_seed_suppliers(p_tenant uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_agent uuid;
  v_count integer;
begin
  select id into v_agent from public.agents where tenant_id = p_tenant and slug = 'comprador';
  if v_agent is null then
    raise exception 'Robô comprador não cadastrado no tenant %', p_tenant;
  end if;

  with ult as (
    select distinct on (i.product_id)
           i.product_id, po.supplier_id, po.po_number, po.order_date, i.unit, i.description
      from public.purchase_order_items i
      join public.purchase_orders po on po.id = i.purchase_order_id
     where po.tenant_id = p_tenant
       and i.product_id is not null
       and po.supplier_id is not null
       and coalesce(po.is_suggestion, false) = false
       and coalesce(i.is_suggestion, false) = false
       and po.status not in ('draft', 'cancelled', 'canceled', 'cancelado', 'rascunho')
     order by i.product_id, po.order_date desc, po.created_at desc
  ), up as (
    insert into public.robot_learning as rl
      (tenant_id, agent_id, context, original_question, approved_answer, source, risk, last_confirmed_at)
    select p_tenant, v_agent,
           'fornecedor_item:' || u.product_id,
           'Qual fornecedor do item ' || coalesce(nullif(p.technical_code, ''), p.code, '') || ' — ' || coalesce(p.name, u.description) || '?',
           jsonb_build_object(
             'produto_id', u.product_id,
             'produto', coalesce(p.name, u.description),
             'codigo', coalesce(nullif(p.technical_code, ''), p.code),
             'fornecedor_id', u.supplier_id,
             'fornecedor', s.name,
             'ultimo_pc', u.po_number,
             'data_ultimo_pc', u.order_date
           ),
           'diretor', 'baixo',
           (u.order_date::timestamp at time zone 'America/Sao_Paulo')
      from ult u
      join public.products p on p.id = u.product_id
      join public.suppliers s on s.id = u.supplier_id
    on conflict (tenant_id, agent_id, context) do update
      set approved_answer   = excluded.approved_answer,
          original_question = excluded.original_question,
          source            = 'diretor',
          last_confirmed_at = excluded.last_confirmed_at
      where rl.last_confirmed_at < excluded.last_confirmed_at
    returning 1
  )
  select count(*) into v_count from up;
  return coalesce(v_count, 0);
end $$;

revoke all on function public.fn_robot_learning_seed_suppliers(uuid) from public, anon, authenticated;
grant execute on function public.fn_robot_learning_seed_suppliers(uuid) to service_role;

-- Carga inicial em todos os tenants que têm o robô comprador.
do $$
declare r record; n integer;
begin
  for r in select distinct a.tenant_id from public.agents a where a.slug = 'comprador' loop
    n := public.fn_robot_learning_seed_suppliers(r.tenant_id);
    raise notice 'Banco de aprendizado: % regras de fornecedor no tenant %', n, r.tenant_id;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
