-- Passo 3 da malha de custos: margem por família (centro produtivo).
--
-- (a) Contas a pagar AVULSAS (sem PC: Pix de mão de obra, aluguel, DAS...) passam a ser
--     classificadas pela categoria, via regra configurável (cost_classification_rules.ap_category).
-- (b) fn_cost_margin_report(tenant, de, até) devolve um JSON compacto:
--     receita e custo padrão (do PV) × custo real direto (PC + contas avulsas) por família,
--     + rateio do apoio (2.xx) e dos custos de produção sem família, pela participação no faturamento.
-- Competência: PV pela data do pedido; PC pela data do pedido; conta avulsa pelo vencimento;
-- conta fixa (fixed_expenses) completa o mês: por centro vale o maior entre lançado e previsto.

-- ---------------------------------------------------------------------------
-- (a) Regras por categoria de conta a pagar
-- ---------------------------------------------------------------------------
ALTER TABLE public.cost_classification_rules
  ADD COLUMN IF NOT EXISTS ap_category TEXT;

ALTER TABLE public.cost_classification_rules DROP CONSTRAINT IF EXISTS cost_rules_has_match;
ALTER TABLE public.cost_classification_rules ADD CONSTRAINT cost_rules_has_match CHECK (
  supplier_id IS NOT NULL OR product_id IS NOT NULL OR product_prefix_code IS NOT NULL
  OR description_pattern IS NOT NULL OR ap_category IS NOT NULL
);

INSERT INTO public.cost_classification_rules (tenant_id, ap_category, cost_center_id, cost_nature_id, priority, notes)
SELECT t.id, m.cat,
  (SELECT id FROM public.cost_centers WHERE tenant_id = t.id AND code = m.cc),
  (SELECT id FROM public.cost_natures WHERE tenant_id = t.id AND code = m.cn),
  60, 'Seed categorias 08/11/2026'
FROM public.tenants t
CROSS JOIN (VALUES
  ('Aluguel', '2.01', 'OCU'),
  ('Benefícios do sócio', '3.01', 'ADM'),
  ('Despesas administrativas', '3.01', 'ADM'),
  ('Despesas financeiras', '3.01', 'ADM'),
  ('Veículo', '3.01', 'ADM'),
  ('Fretes', NULL, 'FRT'),
  ('Impostos - Simples Nacional (DAS)', '3.03', 'IMP'),
  ('Taxas e tributos', '3.03', 'IMP'),
  ('Mão de obra - engenharia', '2.04', 'ENG'),
  ('Mão de obra - fabricação', NULL, 'MO'),
  ('Matéria-prima e insumos', NULL, 'MP'),
  ('Material de consumo / avulsos', '2.03', 'MC'),
  ('Retirada do sócio', '3.04', 'RET'),
  ('Serviços de terceiros - pintura', NULL, 'PIN')
) AS m (cat, cc, cn)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cost_classification_rules r WHERE r.tenant_id = t.id AND r.ap_category = m.cat
);

CREATE OR REPLACE FUNCTION public.trg_ap_inherit_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_center UUID;
  v_nature UUID;
BEGIN
  IF NEW.purchase_order_id IS NOT NULL THEN
    IF NEW.cost_center_id IS NULL AND NEW.cost_nature_id IS NULL THEN
      SELECT po.cost_center_id, po.cost_nature_id INTO NEW.cost_center_id, NEW.cost_nature_id
      FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Conta avulsa: fornecedor > categoria (só preenche o que estiver vazio)
  IF NEW.cost_center_id IS NULL OR NEW.cost_nature_id IS NULL THEN
    SELECT r.cost_center_id, r.cost_nature_id INTO v_center, v_nature
    FROM public.cost_classification_rules r
    WHERE r.tenant_id = NEW.tenant_id AND r.is_active
      AND ((r.supplier_id IS NOT NULL AND r.supplier_id = NEW.supplier_id)
        OR (r.ap_category IS NOT NULL AND r.ap_category = NEW.category))
    ORDER BY CASE WHEN r.supplier_id IS NOT NULL THEN 0 ELSE 1 END, r.priority
    LIMIT 1;
    NEW.cost_center_id := COALESCE(NEW.cost_center_id, v_center);
    NEW.cost_nature_id := COALESCE(NEW.cost_nature_id, v_nature);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ap_inherit_cost ON public.accounts_payable;
CREATE TRIGGER trg_ap_inherit_cost
  BEFORE INSERT OR UPDATE OF category, supplier_id ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.trg_ap_inherit_cost();

-- Implantação: contas avulsas de nov/2026 em diante
UPDATE public.accounts_payable SET category = category
WHERE purchase_order_id IS NULL AND due_date >= DATE '2026-11-01' AND cost_center_id IS NULL;

-- ---------------------------------------------------------------------------
-- (b) Relatório de margem por família
-- ---------------------------------------------------------------------------
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
-- Receita e custo padrão por família (itens de PV não cancelados)
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
-- Custos reais: itens de PC + contas avulsas
real_costs AS (
  SELECT poi.cost_center_id AS center_id, poi.cost_nature_id AS nature_id, coalesce(poi.total_price, 0) AS valor,
         date_trunc('month', po.order_date)::date AS mes
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE po.tenant_id = p_tenant AND po.status <> 'cancelled' AND po.order_date BETWEEN p_from AND p_to
    -- MP/embalagem sem família = compra para ESTOQUE: o custo vai à família no consumo da OP, não na compra
    AND NOT (poi.cost_center_id IS NULL AND poi.cost_nature_id IN (SELECT id FROM nat WHERE code IN ('MP', 'EMB')))
  UNION ALL
  SELECT ap.cost_center_id, ap.cost_nature_id, coalesce(ap.original_amount, 0), date_trunc('month', ap.due_date)::date
  FROM public.accounts_payable ap
  WHERE ap.tenant_id = p_tenant AND ap.purchase_order_id IS NULL AND ap.status <> 'cancelled'
    AND ap.due_date BETWEEN p_from AND p_to
),
-- Contas fixas: só nos meses sem conta real no mesmo centro
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
-- Conta fixa completa o que faltar no mês: max(lançado, previsto) por centro
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
-- Custos de produção sem família (MO/MP/PIN/EMB/FRT avulsos) entram no rateio junto com o apoio
pool AS (
  SELECT
    coalesce(sum(valor) FILTER (WHERE kind = 'support'), 0) AS apoio,
    coalesce(sum(valor) FILTER (WHERE center_id IS NULL AND n_code IN ('MP', 'MO', 'PIN', 'EMB', 'FRT')), 0) AS producao_sem_familia -- MP/EMB aqui só de contas avulsas
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

COMMENT ON FUNCTION public.fn_cost_margin_report(UUID, DATE, DATE) IS
  'Margem por família (centros 1.xx): receita/custo padrão do PV × custo real direto + rateio do apoio pelo faturamento. JSON compacto.';

NOTIFY pgrst, 'reload schema';

-- Centro 1.11 Caixas Especiais (decisão do Helder 08/11/2026): família F sai de 1.10
INSERT INTO public.cost_centers (tenant_id, code, name, parent_id, kind, family_codes, allocation, sort_order)
SELECT t.id, '1.11', 'Caixas Especiais', (SELECT id FROM public.cost_centers WHERE tenant_id = t.id AND code = '1'), 'productive', '{F}', 'direct', 111
FROM public.tenants t ON CONFLICT (tenant_id, code) DO NOTHING;
UPDATE public.cost_centers SET family_codes = array_remove(family_codes, 'F'),
  notes = 'Filtros, difusores, ventiladores, automação, painéis, cabine de fluxo, dutos, MO vendida'
WHERE code = '1.10';
