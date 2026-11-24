-- Robôs de engenharia: Desenhista (gera equipamento no Inventor) e Compositor (custo + composição no ERP).
-- Não mandam nada para fora; podem rodar fora do horário comercial.
begin;

insert into public.agents (tenant_id, slug, name, role, status, window_start, window_end, max_actions_per_hour)
select t.id, r.slug, r.name, r.role, 'ativo', '00:00'::time, '23:59:59'::time, r.max_per_hour
from public.tenants t
cross join (values
  ('desenhista', 'Desenhista (Inventor)', 'Gera equipamento a partir de modelo parametrizado homologado: planilha, DXF, PDF, lista de peças', 20),
  ('compositor', 'Compositor',            'Lê a lista de peças, calcula o custo HD e monta a composição do produto no ERP', 60)
) as r(slug, name, role, max_per_hour)
on conflict (tenant_id, slug) do nothing;

notify pgrst, 'reload schema';
commit;
