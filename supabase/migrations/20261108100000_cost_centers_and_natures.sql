-- Malha de centros de custo + naturezas de custo (HD Industrial, nov/2026).
-- Dois eixos em todo lançamento:
--   * centro de custo  = PARA ONDE foi o gasto (família de produto ou área de apoio/adm)
--   * natureza de custo = O QUE foi gasto (MP, MO, pintura, uso e consumo, frete...)
-- Vale daqui para frente (implantação nov–dez/2026, 100% a partir de jan/2027).
-- Lançamentos antigos ficam sem classificação (NULL) — não há backfill.

-- ---------------------------------------------------------------------------
-- 1. Famílias que existem no site e faltavam no ERP: FFU (R) e Cabine de Pintura (S)
--    nos prefixos de produto acabado/vendido (HD1, HD2, HD3, AC).
-- ---------------------------------------------------------------------------
INSERT INTO public.product_families (tenant_id, prefix_id, code, name, sort_order, is_active)
SELECT px.tenant_id, px.id, f.code, f.name, f.sort_order, true
FROM public.product_prefixes px
CROSS JOIN (VALUES ('R', 'FFU (Fan Filter Unit)', 170), ('S', 'Cabine de Pintura', 180)) AS f (code, name, sort_order)
WHERE px.code IN ('HD1', 'HD2', 'HD3', 'AC')
ON CONFLICT (tenant_id, prefix_id, code) WHERE prefix_id IS NOT NULL DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Centros de custo (hierárquicos: grupo 1/2/3/4 → centro 1.01, 1.02...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  -- productive = família de produto · support = apoio à produção (rateado)
  -- admin = administrativo/comercial · tax = impostos · owner = sócio (fora do resultado)
  -- service = receita de serviço (consultoria)
  kind TEXT NOT NULL CHECK (kind IN ('group', 'productive', 'support', 'admin', 'tax', 'owner', 'service')),
  -- Letras de família de produto (product_families.code nos prefixos HD1/HD2/HD3/AC) que caem neste centro.
  family_codes TEXT[] NOT NULL DEFAULT '{}',
  -- Como o custo chega ao produto: direct = direto na família · revenue_share = rateio pelo
  -- faturamento de cada família no mês · none = não rateia (adm, impostos, sócio)
  allocation TEXT NOT NULL DEFAULT 'direct' CHECK (allocation IN ('direct', 'revenue_share', 'none')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cost_centers_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant ON public.cost_centers (tenant_id, is_active);

COMMENT ON TABLE public.cost_centers IS
  'Centros de custo (para onde vai o gasto). Grupos: 1 Produtivos por família, 2 Apoio (rateado), 3 Adm/comercial, 4 Serviços.';

-- ---------------------------------------------------------------------------
-- 3. Naturezas de custo (o que foi gasto)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_natures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Prefixos de produto que já indicam esta natureza (ex.: MP → Matéria-prima).
  product_prefix_codes TEXT[] NOT NULL DEFAULT '{}',
  -- variable = custo do produto (entra na margem de contribuição) · fixed = despesa do período
  behavior TEXT NOT NULL DEFAULT 'variable' CHECK (behavior IN ('variable', 'fixed', 'capex', 'none')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cost_natures_tenant_code UNIQUE (tenant_id, code)
);

COMMENT ON TABLE public.cost_natures IS
  'Naturezas de custo (o que foi gasto): MP, MO, pintura terceirizada, uso e consumo, frete, ferramentas...';

-- ---------------------------------------------------------------------------
-- 4. Regras automáticas de classificação (para o sistema classificar sozinho)
--    Ordem de decisão no código: item ligado a PV/OP → família do produto vendido;
--    depois regra por produto > por fornecedor > por prefixo do produto; senão pergunta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE CASCADE,
  product_prefix_code TEXT,
  description_pattern TEXT, -- ILIKE, ex.: '%pintura%'
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE CASCADE,
  cost_nature_id UUID REFERENCES public.cost_natures (id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 100, -- menor = mais forte
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cost_rules_has_match CHECK (
    supplier_id IS NOT NULL OR product_id IS NOT NULL OR product_prefix_code IS NOT NULL OR description_pattern IS NOT NULL
  ),
  CONSTRAINT cost_rules_has_target CHECK (cost_center_id IS NOT NULL OR cost_nature_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cost_rules_tenant ON public.cost_classification_rules (tenant_id, is_active, priority);

-- ---------------------------------------------------------------------------
-- 5. Colunas de classificação nos lançamentos (todas opcionais; NULL = não classificado)
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_nature_id UUID REFERENCES public.cost_natures (id) ON DELETE SET NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_nature_id UUID REFERENCES public.cost_natures (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_classified_by TEXT CHECK (cost_classified_by IN ('auto', 'rule', 'manual'));

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_nature_id UUID REFERENCES public.cost_natures (id) ON DELETE SET NULL;

ALTER TABLE public.fixed_expenses
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_nature_id UUID REFERENCES public.cost_natures (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_items_cost_center ON public.purchase_order_items (tenant_id, cost_center_id);
CREATE INDEX IF NOT EXISTS idx_ap_cost_center ON public.accounts_payable (tenant_id, cost_center_id);

-- ---------------------------------------------------------------------------
-- 6. Seed por tenant: malha aprovada pelo Helder em 06/11/2026
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tenant UUID;
  g1 UUID; g2 UUID; g3 UUID; g4 UUID;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.cost_centers (tenant_id, code, name, kind, allocation, sort_order) VALUES
      (v_tenant, '1', 'Produtivos (por família)', 'group', 'direct', 100),
      (v_tenant, '2', 'Apoio à produção', 'group', 'revenue_share', 200),
      (v_tenant, '3', 'Administrativo e comercial', 'group', 'none', 300),
      (v_tenant, '4', 'Serviços', 'group', 'none', 400)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO g1 FROM public.cost_centers WHERE tenant_id = v_tenant AND code = '1';
    SELECT id INTO g2 FROM public.cost_centers WHERE tenant_id = v_tenant AND code = '2';
    SELECT id INTO g3 FROM public.cost_centers WHERE tenant_id = v_tenant AND code = '3';
    SELECT id INTO g4 FROM public.cost_centers WHERE tenant_id = v_tenant AND code = '4';

    INSERT INTO public.cost_centers (tenant_id, code, name, parent_id, kind, family_codes, allocation, sort_order, notes) VALUES
      (v_tenant, '1.01', 'Fluxo Laminar', g1, 'productive', '{A}', 'direct', 101, NULL),
      (v_tenant, '1.02', 'FFU (Fan Filter Unit)', g1, 'productive', '{R}', 'direct', 102, NULL),
      (v_tenant, '1.03', 'Caixa Terminal', g1, 'productive', '{B}', 'direct', 103, NULL),
      (v_tenant, '1.04', 'Caixas entre dutos', g1, 'productive', '{C}', 'direct', 104, NULL),
      (v_tenant, '1.05', 'Caixa de Ventilação (CVE1E)', g1, 'productive', '{D}', 'direct', 105, NULL),
      (v_tenant, '1.06', 'BiBo', g1, 'productive', '{E}', 'direct', 106, NULL),
      (v_tenant, '1.07', 'UTA', g1, 'productive', '{L}', 'direct', 107, NULL),
      (v_tenant, '1.08', 'Cabine de Pintura', g1, 'productive', '{S}', 'direct', 108, NULL),
      (v_tenant, '1.09', 'Flanges Daikin', g1, 'productive', '{G}', 'direct', 109, NULL),
      (v_tenant, '1.10', 'Outros produtos', g1, 'productive', '{F,I,J,V,K,M,O,P,Q}', 'direct', 110,
        'Caixas especiais, filtros, difusores, ventiladores, automação, painéis, cabine de fluxo, dutos, MO vendida'),
      (v_tenant, '2.01', 'Galpão (aluguel, luz, água)', g2, 'support', '{}', 'revenue_share', 201, NULL),
      (v_tenant, '2.02', 'Ferramentas e equipamentos', g2, 'support', '{}', 'revenue_share', 202, NULL),
      (v_tenant, '2.03', 'Uso e consumo geral', g2, 'support', '{}', 'revenue_share', 203, NULL),
      (v_tenant, '2.04', 'Engenharia / projeto', g2, 'support', '{}', 'revenue_share', 204, NULL),
      (v_tenant, '3.01', 'Administrativo', g3, 'admin', '{}', 'none', 301, 'Contador, TI, internet, plano de saúde'),
      (v_tenant, '3.02', 'Comercial / marketing', g3, 'admin', '{}', 'none', 302, 'Comissão, Equifax, site, divulgação'),
      (v_tenant, '3.03', 'Impostos (DAS)', g3, 'tax', '{}', 'none', 303, NULL),
      (v_tenant, '3.04', 'Sócio (retirada)', g3, 'owner', '{}', 'none', 304, 'Fora do resultado operacional'),
      (v_tenant, '4.01', 'Consultoria (HEPA)', g4, 'service', '{}', 'none', 401, NULL)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO public.cost_natures (tenant_id, code, name, product_prefix_codes, behavior, sort_order) VALUES
      (v_tenant, 'MP', 'Matéria-prima', '{MP,SE}', 'variable', 10),
      (v_tenant, 'MO', 'Mão de obra de produção', '{MO}', 'variable', 20),
      (v_tenant, 'PIN', 'Pintura / serviço terceirizado', '{}', 'variable', 30),
      (v_tenant, 'EMB', 'Embalagem', '{EB}', 'variable', 40),
      (v_tenant, 'FRT', 'Frete', '{}', 'variable', 50),
      (v_tenant, 'REV', 'Mercadoria para revenda', '{RV,HD3}', 'variable', 60),
      (v_tenant, 'COM', 'Comissão de venda', '{}', 'variable', 70),
      (v_tenant, 'MC', 'Uso e consumo', '{MC}', 'fixed', 80),
      (v_tenant, 'FER', 'Ferramentas e equipamentos', '{}', 'capex', 90),
      (v_tenant, 'ENG', 'Engenharia / projetista', '{}', 'fixed', 100),
      (v_tenant, 'OCU', 'Ocupação (aluguel, energia, água)', '{}', 'fixed', 110),
      (v_tenant, 'ADM', 'Despesa administrativa', '{}', 'fixed', 120),
      (v_tenant, 'IMP', 'Impostos', '{}', 'none', 130),
      (v_tenant, 'RET', 'Retirada do sócio', '{}', 'none', 140)
    ON CONFLICT (tenant_id, code) DO NOTHING;
  END LOOP;
END $$;

-- Regras iniciais por fornecedor (conhecidas): pintura terceirizada e chapa
INSERT INTO public.cost_classification_rules (tenant_id, supplier_id, cost_nature_id, priority, notes)
SELECT s.tenant_id, s.id, n.id, 50, 'Seed 06/11/2026'
FROM public.suppliers s
JOIN public.cost_natures n ON n.tenant_id = s.tenant_id
  AND n.code = CASE
    WHEN s.name ILIKE '%JUSELHA%' OR s.name ILIKE '%MODESTO%' THEN 'PIN'
    WHEN s.name ILIKE '%ACO LIDER%' OR s.name ILIKE '%RIOTERRA%' OR s.name ILIKE '%ARCELOR%' THEN 'MP'
  END
WHERE s.name ILIKE ANY (ARRAY['%JUSELHA%', '%MODESTO%', '%ACO LIDER%', '%RIOTERRA%', '%ARCELOR%'])
  AND NOT EXISTS (
    SELECT 1 FROM public.cost_classification_rules r WHERE r.tenant_id = s.tenant_id AND r.supplier_id = s.id
  );

-- Contas fixas já cadastradas → centro/natureza pela descrição
UPDATE public.fixed_expenses fe
SET cost_center_id = cc.id, cost_nature_id = cn.id
FROM (
  SELECT fe2.id AS fe_id,
    CASE
      WHEN fe2.cost_center_type = 'retirada' THEN '3.04'
      WHEN fe2.cost_center_type = 'imposto' THEN '3.03'
      WHEN fe2.description ILIKE ANY (ARRAY['%aluguel%', '%energia%', '%luz%', '%água%', '%agua%']) THEN '2.01'
      ELSE '3.01'
    END AS cc_code,
    CASE
      WHEN fe2.cost_center_type = 'retirada' THEN 'RET'
      WHEN fe2.cost_center_type = 'imposto' THEN 'IMP'
      WHEN fe2.description ILIKE ANY (ARRAY['%aluguel%', '%energia%', '%luz%', '%água%', '%agua%']) THEN 'OCU'
      ELSE 'ADM'
    END AS cn_code,
    fe2.tenant_id
  FROM public.fixed_expenses fe2
  WHERE fe2.cost_center_id IS NULL
) m
JOIN public.cost_centers cc ON cc.tenant_id = m.tenant_id AND cc.code = m.cc_code
JOIN public.cost_natures cn ON cn.tenant_id = m.tenant_id AND cn.code = m.cn_code
WHERE fe.id = m.fe_id;

-- ---------------------------------------------------------------------------
-- 7. updated_at + RLS (mesmo padrão das demais tabelas)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_cost_centers_updated_at ON public.cost_centers;
CREATE TRIGGER trg_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at ();
DROP TRIGGER IF EXISTS trg_cost_natures_updated_at ON public.cost_natures;
CREATE TRIGGER trg_cost_natures_updated_at BEFORE UPDATE ON public.cost_natures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at ();
DROP TRIGGER IF EXISTS trg_cost_rules_updated_at ON public.cost_classification_rules;
CREATE TRIGGER trg_cost_rules_updated_at BEFORE UPDATE ON public.cost_classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at ();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_centers', 'cost_natures', 'cost_classification_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (tenant_id = public.get_current_tenant_id ()) WITH CHECK (tenant_id = public.get_current_tenant_id ())',
      t || '_tenant_all', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
