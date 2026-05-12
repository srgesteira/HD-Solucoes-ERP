-- Business Intelligence e Agente Consultor: insights, KPIs e previsões

-- 1. Análises geradas (cache)
CREATE TABLE IF NOT EXISTS public.bi_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  insight_type TEXT NOT NULL CHECK (
    insight_type IN (
      'profit_analysis',
      'top_products',
      'customer_analysis',
      'sales_forecast',
      'payment_risk',
      'production_efficiency',
      'inventory_alert',
      'price_suggestion'
    )
  ),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  metrics JSONB,

  is_dismissed BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,

  analysis_period TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW (),
  created_at TIMESTAMPTZ DEFAULT NOW ()
);

-- 2. Metas e KPIs
CREATE TABLE IF NOT EXISTS public.company_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  kpi_name TEXT NOT NULL,
  kpi_category TEXT,

  year INT NOT NULL,
  month INT NOT NULL,

  target_value NUMERIC(12, 2) NOT NULL,
  current_value NUMERIC(12, 2) DEFAULT 0,
  unit TEXT DEFAULT 'BRL',

  created_at TIMESTAMPTZ DEFAULT NOW (),
  updated_at TIMESTAMPTZ DEFAULT NOW (),

  CONSTRAINT company_kpis_tenant_kpi_period_unique UNIQUE (tenant_id, kpi_name, year, month)
);

-- 3. Histórico de previsões
CREATE TABLE IF NOT EXISTS public.bi_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  forecast_type TEXT NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_value NUMERIC(12, 2) NOT NULL,
  actual_value NUMERIC(12, 2),

  confidence_score NUMERIC(3, 2),
  model_version TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_bi_insights_tenant ON public.bi_insights (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bi_insights_type ON public.bi_insights (insight_type);
CREATE INDEX IF NOT EXISTS idx_bi_insights_priority ON public.bi_insights (priority);
CREATE INDEX IF NOT EXISTS idx_company_kpis_tenant ON public.company_kpis (tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_kpis_period ON public.company_kpis (year, month);
CREATE INDEX IF NOT EXISTS idx_bi_forecasts_tenant ON public.bi_forecasts (tenant_id);

ALTER TABLE public.bi_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_insights_select" ON public.bi_insights FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "bi_insights_insert" ON public.bi_insights FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "bi_insights_update" ON public.bi_insights FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "company_kpis_select" ON public.company_kpis FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "company_kpis_insert" ON public.company_kpis FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "company_kpis_update" ON public.company_kpis FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "bi_forecasts_select" ON public.bi_forecasts FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "bi_forecasts_insert" ON public.bi_forecasts FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "bi_forecasts_update" ON public.bi_forecasts FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP TRIGGER IF EXISTS company_kpis_updated_at ON public.company_kpis;

CREATE TRIGGER company_kpis_updated_at
BEFORE UPDATE ON public.company_kpis FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();
