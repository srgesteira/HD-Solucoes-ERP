-- Regimes tributários, benefícios por NCM e histórico de análises fiscais (IA Contador)

CREATE TABLE IF NOT EXISTS public.tax_regimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tax_icms DECIMAL(5, 2),
    tax_pis DECIMAL(5, 2),
    tax_cofins DECIMAL(5, 2),
    tax_ipi DECIMAL(5, 2),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.ncm_tax_benefits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    ncm TEXT NOT NULL,
    benefit_type TEXT NOT NULL,
    description TEXT,
    tax_affected TEXT,
    original_rate DECIMAL(5, 2),
    effective_rate DECIMAL(5, 2),
    savings_estimate DECIMAL(5, 2),
    requirements TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, ncm, benefit_type)
);

CREATE TABLE IF NOT EXISTS public.tax_analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    ncm TEXT,
    tax_regime_id UUID REFERENCES public.tax_regimes(id),
    analysis JSONB,
    recommendation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_regimes_tenant ON public.tax_regimes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ncm_tax_benefits_tenant_ncm ON public.ncm_tax_benefits (tenant_id, ncm);
CREATE INDEX IF NOT EXISTS idx_tax_analysis_history_tenant_product ON public.tax_analysis_history (tenant_id, product_id);

ALTER TABLE public.tax_regimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncm_tax_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_regimes_select" ON public.tax_regimes FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tax_regimes_admin" ON public.tax_regimes FOR ALL
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "ncm_tax_benefits_select" ON public.ncm_tax_benefits FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "ncm_tax_benefits_admin" ON public.ncm_tax_benefits FOR ALL
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "tax_analysis_history_select" ON public.tax_analysis_history FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "tax_analysis_history_insert" ON public.tax_analysis_history FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Regimes iniciais (um conjunto por tenant)
INSERT INTO public.tax_regimes (tenant_id, name, tax_icms, tax_pis, tax_cofins, tax_ipi, is_default)
SELECT
  t.id,
  'Simples Nacional',
  4,
  0,
  0,
  0,
  true
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tax_regimes (tenant_id, name, tax_icms, tax_pis, tax_cofins, tax_ipi, is_default)
SELECT
  t.id,
  'Lucro Presumido',
  18,
  0.65,
  3,
  0,
  false
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tax_regimes (tenant_id, name, tax_icms, tax_pis, tax_cofins, tax_ipi, is_default)
SELECT
  t.id,
  'Lucro Real',
  12,
  1.65,
  7.6,
  0,
  false
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Benefícios exemplo NCM 84213990
INSERT INTO public.ncm_tax_benefits (
  tenant_id,
  ncm,
  benefit_type,
  description,
  tax_affected,
  original_rate,
  effective_rate,
  savings_estimate
)
SELECT
  t.id,
  '84213990',
  'exemption',
  'Isenção de IPI para equipamentos de filtragem',
  'ipi',
  10,
  0,
  10
FROM public.tenants t
ON CONFLICT (tenant_id, ncm, benefit_type) DO NOTHING;

INSERT INTO public.ncm_tax_benefits (
  tenant_id,
  ncm,
  benefit_type,
  description,
  tax_affected,
  original_rate,
  effective_rate,
  savings_estimate
)
SELECT
  t.id,
  '84213990',
  'reduced_rate',
  'Alíquota reduzida de ICMS para industrialização',
  'icms',
  18,
  12,
  6
FROM public.tenants t
ON CONFLICT (tenant_id, ncm, benefit_type) DO NOTHING;

COMMENT ON TABLE public.tax_regimes IS 'Regimes tributários por tenant (Simples, Lucro Presumido, Lucro Real)';
COMMENT ON TABLE public.ncm_tax_benefits IS 'Benefícios fiscais por NCM';
COMMENT ON TABLE public.tax_analysis_history IS 'Histórico de análises fiscais geradas pela IA';
