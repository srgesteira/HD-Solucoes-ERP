-- Etapa 6.2 — métricas dos robôs a partir de eventos_hd (view, sem tabela nova).
create or replace view public.metricas_hd with (security_invoker = true) as
select
  e.tenant_id,
  e.robo,
  count(*)                                                        as escalados,
  count(*) filter (where e.status = 'resolvido')                  as resolvidos,
  count(*) filter (where e.status = 'resolvido' and e.aguardando_desde is null)     as resolvidos_sem_ok,
  count(*) filter (where e.status = 'resolvido' and e.aguardando_desde is not null) as resolvidos_com_ok,
  count(*) filter (where e.status = 'falha_hd_central' or e.tentativas > 0)          as falhas_hd_central,
  round(avg(extract(epoch from (e.atualizado_em - e.criado_em)) / 60) filter (where e.status = 'resolvido'))::int as minutos_medios_ate_resolver,
  count(*) filter (where e.severidade = 'critico')                as criticos,
  count(*) filter (where e.severidade = 'critico' and e.status = 'resolvido'
                     and (e.atualizado_em at time zone 'America/Sao_Paulo')::date = (e.criado_em at time zone 'America/Sao_Paulo')::date) as criticos_resolvidos_no_dia
from public.eventos_hd e
group by e.tenant_id, e.robo;

create or replace view public.metricas_hd_dedupe_top with (security_invoker = true) as
select tenant_id, regexp_replace(dedupe_key, ':\d{4}-\d{2}-\d{2}$', '') as chave, count(*) as vezes
from public.eventos_hd
where criado_em > now() - interval '30 days'
group by 1, 2
order by vezes desc;
