-- Departamentos, alocação de colaboradores e custo MO com rateio de apoio.

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_support BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT departments_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON public.departments(tenant_id);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocation_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.0;

COMMENT ON COLUMN public.employees.allocation_percentage IS
  'Percentual de dedicação (100 = tempo integral na linha/departamento).';

CREATE TABLE IF NOT EXISTS public.employee_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  allocation_percentage NUMERIC(5, 2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_allocations_employee
  ON public.employee_allocations(tenant_id, employee_id);

-- Liga linha PCP (production_lines) ao centro de custo MO (work_centers).
ALTER TABLE public.production_lines
  ADD COLUMN IF NOT EXISTS work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_lines_tenant_work_center_uq
  ON public.production_lines(tenant_id, work_center_id)
  WHERE work_center_id IS NOT NULL;

ALTER TABLE public.labor_costs
  ADD COLUMN IF NOT EXISTS direct_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS allocated_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS direct_hourly_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS allocated_hourly_rate NUMERIC(10, 2);

COMMENT ON COLUMN public.labor_costs.direct_cost IS 'Custo salarial directo da linha no mês.';
COMMENT ON COLUMN public.labor_costs.allocated_cost IS 'Parcela rateada dos departamentos de apoio.';
COMMENT ON COLUMN public.labor_costs.direct_hourly_rate IS 'Custo/hora só da mão de obra directa.';
COMMENT ON COLUMN public.labor_costs.allocated_hourly_rate IS 'Custo/hora da parcela rateada.';

-- Sincronizar production_lines com work_centers existentes (mesmo código).
INSERT INTO public.production_lines (tenant_id, code, name, description, is_active, sort_order, work_center_id)
SELECT
  wc.tenant_id,
  wc.code,
  wc.name,
  wc.description,
  wc.is_active,
  0,
  wc.id
FROM public.work_centers wc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.production_lines pl
  WHERE pl.tenant_id = wc.tenant_id
    AND pl.work_center_id = wc.id
)
ON CONFLICT (tenant_id, code) DO UPDATE
SET
  work_center_id = EXCLUDED.work_center_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- Centros sem linha PCP: criar por código.
INSERT INTO public.production_lines (tenant_id, code, name, description, is_active, sort_order, work_center_id)
SELECT
  wc.tenant_id,
  wc.code,
  wc.name,
  COALESCE(wc.description, ''),
  wc.is_active,
  0,
  wc.id
FROM public.work_centers wc
WHERE NOT EXISTS (
  SELECT 1 FROM public.production_lines pl
  WHERE pl.tenant_id = wc.tenant_id AND (pl.work_center_id = wc.id OR pl.code = wc.code)
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select ON public.departments;
CREATE POLICY departments_select ON public.departments
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS departments_insert ON public.departments;
CREATE POLICY departments_insert ON public.departments
  FOR INSERT WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS departments_update ON public.departments;
CREATE POLICY departments_update ON public.departments
  FOR UPDATE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS departments_delete ON public.departments;
CREATE POLICY departments_delete ON public.departments
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

ALTER TABLE public.employee_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_allocations_select ON public.employee_allocations;
CREATE POLICY employee_allocations_select ON public.employee_allocations
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());
