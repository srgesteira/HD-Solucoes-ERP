-- Custo de mão de obra por linha (histórico mensal) + horas padrão mensais no centro

ALTER TABLE public.work_centers
  ADD COLUMN IF NOT EXISTS default_monthly_hours INT NOT NULL DEFAULT 220;

COMMENT ON COLUMN public.work_centers.default_monthly_hours IS
  'Horas padrão por mês para repartir custo de salários (ex.: 220)';

CREATE TABLE IF NOT EXISTS public.labor_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  work_center_id UUID NOT NULL REFERENCES public.work_centers (id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  hourly_rate NUMERIC(10, 2) NOT NULL,
  total_salary_base NUMERIC(12, 2) NOT NULL,
  total_hours_base INT NOT NULL CHECK (total_hours_base >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT labor_costs_uniq_tenant_center_period UNIQUE (tenant_id, work_center_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_labor_costs_center ON public.labor_costs (work_center_id, year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_labor_costs_tenant_ym ON public.labor_costs (tenant_id, year, month);

ALTER TABLE public.labor_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_costs_select ON public.labor_costs;

DROP POLICY IF EXISTS labor_costs_insert ON public.labor_costs;

DROP POLICY IF EXISTS labor_costs_update ON public.labor_costs;

DROP POLICY IF EXISTS labor_costs_delete ON public.labor_costs;

CREATE POLICY labor_costs_select ON public.labor_costs FOR SELECT TO authenticated USING (
  tenant_id = public.get_current_tenant_id ()
);

CREATE POLICY labor_costs_insert ON public.labor_costs FOR INSERT TO authenticated WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY labor_costs_update ON public.labor_costs FOR UPDATE TO authenticated USING (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
)
WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

COMMENT ON TABLE public.labor_costs IS 'Histórico de custo/hora calculado por linha e mês (salários / horas padrão)';

NOTIFY pgrst, 'reload schema';
