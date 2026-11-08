-- Margem por família — fecha as lacunas:
-- (1) MP/embalagem consumida na OP (saída "production_supply" do almoxarifado) entra como custo da família
--     do produto da OP, no mês da baixa, pelo custo do cadastro (products.cost_price). Para não contar duas
--     vezes, item de PC de MP/embalagem com produto cadastrado deixa de contar na compra (vira estoque).
-- (2) Receita de serviços (consultoria, centro 4.01) vem das contas a receber classificadas.

ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.trg_receivable_classify()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cost_center_id IS NULL AND NEW.sales_order_id IS NULL AND NEW.description ILIKE '%consultoria%' THEN
    SELECT id INTO NEW.cost_center_id FROM public.cost_centers WHERE tenant_id = NEW.tenant_id AND code = '4.01';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_receivable_classify ON public.receivables;
CREATE TRIGGER trg_receivable_classify BEFORE INSERT OR UPDATE OF description, sales_order_id ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.trg_receivable_classify();

UPDATE public.receivables r SET cost_center_id = cc.id
FROM public.cost_centers cc
WHERE cc.tenant_id = r.tenant_id AND cc.code = '4.01'
  AND r.cost_center_id IS NULL AND r.sales_order_id IS NULL AND r.description ILIKE '%consultoria%';

CREATE OR REPLACE FUNCTION public.fn_cost_margin_report(p_tenant UUID, p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH
cc AS (
  SELECT id, code, name, kind FROM public.cost_centers WHERE tenant_id = p_tenant AND is_active
),
nat AS (
  SELECT id, code FROM public.cost_natures WHERE tenant_id = p_tenant
),
rev AS (
  SELECT public.fn_cost_family_center(p_tenant, soi.product_id) AS center_id,
         sum(coalesce(soi.total_price, 0) - coalesce(soi.discount, 0)) AS receita,
         sum(coalesce(soi.total_cost, 0)) AS custo_padrao
  FROM public.sales_order_items soi
  JOIN public.sales_orders so ON so.id = soi.sales_order_id
  WHERE so.tenant_id = p_tenant AND so.status <> 'cancelled'
    AND so.order_date BETWEEN p_from AND p_to
  GROUP BY 1
),
servicos AS (
  SELECT c.code, sum(r.original_amount) AS receita
  FROM public.receivables r JOIN cc c ON c.id = r.cost_center_id
  WHERE r.tenant_id = p_tenant AND c.kind = 'service' AND coalesce(r.status, '') <> 'cancelled'
    AND r.due_date BETWEEN p_from AND p_to
  GROUP BY 1
),
-- MP/embalagem consumida na OP
consumo AS (
  SELECT public.fn_cost_family_center(p_tenant, coalesce(soi.product_id, oi.product_id)) AS center_id,
         (SELECT n.id FROM nat n WHERE n.code = CASE WHEN px.code = 'EB' THEN 'EMB' ELSE 'MP' END) AS nature_id,
         abs(coalesce(m.quantity, 0)) * coalesce(p.cost_price, 0) AS valor,
         date_trunc('month', m.created_at)::date AS mes
  FROM public.inventory_movements m
  JOIN public.order_items oi ON oi.id = m.reference_id
  LEFT JOIN public.sales_order_items soi ON soi.id = oi.sales_order_item_id
  JOIN public.products p ON p.id = m.product_id
  LEFT JOIN public.product_prefixes px ON px.id = p.prefix_id
  WHERE m.tenant_id = p_tenant AND m.movement_type = 'out' AND m.origin = 'production_supply'
    AND m.created_at::date BETWEEN p_from AND p_to
),
real_costs AS (
  SELECT poi.cost_center_id AS center_id, poi.cost_nature_id AS nature_id, coalesce(poi.total_price, 0) AS valor,
         date_trunc('month', po.order_date)::date AS mes
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE po.tenant_id = p_tenant AND po.status <> 'cancelled' AND po.order_date BETWEEN p_from AND p_to
    -- MP/embalagem: sem família ou produto de estoque (não ligado a PV) → custo vai no consumo da OP;
    -- compra ligada direto a um item de PV conta como custo direto na hora
    AND NOT (poi.cost_nature_id IN (SELECT id FROM nat WHERE code IN ('MP', 'EMB'))
             AND (poi.cost_center_id IS NULL OR (poi.product_id IS NOT NULL AND poi.sales_order_item_id IS NULL)))
  UNION ALL
  SELECT ap.cost_center_id, ap.cost_nature_id, coalesce(ap.original_amount, 0), date_trunc('month', ap.due_date)::date
  FROM public.accounts_payable ap
  WHERE ap.tenant_id = p_tenant AND ap.purchase_order_id IS NULL AND ap.status <> 'cancelled'
    AND ap.due_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT center_id, nature_id, valor, mes FROM consumo
),
months AS (
  SELECT generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date AS mes
),
fixed_cm AS (
  SELECT fe.cost_center_id AS center_id, m.mes, min(fe.cost_nature_id::text)::uuid AS nature_id,
         sum(coalesce(fo.amount, fe.amount)) AS valor
  FROM public.fixed_expenses fe
  CROSS JOIN months m
  LEFT JOIN public.fixed_expense_overrides fo ON fo.fixed_expense_id = fe.id AND fo.competencia = to_char(m.mes, 'YYYY-MM')
  WHERE fe.tenant_id = p_tenant AND fe.is_active AND fe.cost_center_id IS NOT NULL
    AND fe.start_date <= (m.mes + interval '1 month - 1 day')::date
    AND (fe.end_date IS NULL OR fe.end_date >= m.mes)
  GROUP BY 1, 2
),
fixed_costs AS (
  SELECT f.center_id, f.nature_id,
         greatest(0, f.valor - coalesce((SELECT sum(rc.valor) FROM real_costs rc WHERE rc.center_id = f.center_id AND rc.mes = f.mes), 0)) AS valor
  FROM fixed_cm f
),
all_costs AS (
  SELECT center_id, nature_id, valor FROM real_costs
  UNION ALL
  SELECT center_id, nature_id, valor FROM fixed_costs
),
costs AS (
  SELECT ac.center_id, c.kind, c.code AS cc_code, n.code AS n_code, sum(ac.valor) AS valor
  FROM all_costs ac
  LEFT JOIN cc c ON c.id = ac.center_id
  LEFT JOIN nat n ON n.id = ac.nature_id
  GROUP BY 1, 2, 3, 4
),
pool AS (
  SELECT
    coalesce(sum(valor) FILTER (WHERE kind = 'support'), 0) AS apoio,
    coalesce(sum(valor) FILTER (WHERE center_id IS NULL AND n_code IN ('MP', 'MO', 'PIN', 'EMB', 'FRT')), 0) AS producao_sem_familia
  FROM costs
),
tot_rev AS (
  SELECT nullif(sum(receita) FILTER (WHERE center_id IS NOT NULL), 0) AS total FROM rev
),
fam AS (
  SELECT c.code, c.name,
    round(coalesce(r.receita, 0), 2) AS receita,
    round(coalesce(r.custo_padrao, 0), 2) AS custo_padrao,
    (SELECT coalesce(jsonb_object_agg(x.n_code, round(x.v, 2)), '{}'::jsonb)
       FROM (SELECT coalesce(n_code, '?') AS n_code, sum(valor) AS v FROM costs WHERE center_id = c.id GROUP BY 1) x) AS direto,
    round(coalesce((SELECT sum(valor) FROM costs WHERE center_id = c.id), 0), 2) AS direto_total,
    round(coalesce(r.receita, 0) / coalesce((SELECT total FROM tot_rev), 1)
      * (SELECT apoio + producao_sem_familia FROM pool), 2) AS rateio
  FROM cc c
  LEFT JOIN rev r ON r.center_id = c.id
  WHERE c.kind = 'productive'
)
SELECT jsonb_build_object(
  'periodo', jsonb_build_array(p_from, p_to),
  'familias', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'c', f.code, 'nome', f.name, 'receita', f.receita,
      'custo_padrao', f.custo_padrao,
      'margem_padrao_pct', CASE WHEN f.receita > 0 AND f.custo_padrao > 0 THEN round((f.receita - f.custo_padrao) / f.receita * 100, 1) END,
      'direto', f.direto, 'direto_total', f.direto_total, 'rateio', f.rateio,
      'margem_real', round(f.receita - f.direto_total - f.rateio, 2),
      'margem_real_pct', CASE WHEN f.receita > 0 THEN round((f.receita - f.direto_total - f.rateio) / f.receita * 100, 1) END
    ) ORDER BY f.code)
    FROM fam f WHERE f.receita <> 0 OR f.direto_total <> 0
  ), '[]'::jsonb),
  'servicos', coalesce((SELECT jsonb_object_agg(code, round(receita, 2)) FROM servicos), '{}'::jsonb),
  'consumo_mp', round(coalesce((SELECT sum(valor) FROM consumo), 0), 2),
  'receita_sem_familia', round(coalesce((SELECT receita FROM rev WHERE center_id IS NULL), 0), 2),
  'rateio_base', jsonb_build_object(
    'apoio', round((SELECT apoio FROM pool), 2),
    'producao_sem_familia', round((SELECT producao_sem_familia FROM pool), 2)
  ),
  'abaixo_da_margem', coalesce((
    SELECT jsonb_object_agg(cc_code, round(v, 2)) FROM (
      SELECT cc_code, sum(valor) AS v FROM costs WHERE kind IN ('admin', 'tax', 'owner') GROUP BY 1
    ) a
  ), '{}'::jsonb),
  'sem_classificacao', round(coalesce((
    SELECT sum(valor) FROM costs WHERE center_id IS NULL AND (n_code IS NULL OR n_code NOT IN ('MP', 'MO', 'PIN', 'EMB', 'FRT'))
  ), 0), 2)
);
$$;

NOTIFY pgrst, 'reload schema';
