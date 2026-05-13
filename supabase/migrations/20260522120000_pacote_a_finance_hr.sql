-- Pacote A: contas a pagar, lançamentos manuais de fluxo de caixa, colaboradores (RH)

CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers (id) ON DELETE SET NULL,
  original_amount NUMERIC(12, 2) NOT NULL,
  current_amount NUMERIC(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_tenant ON public.accounts_payable (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_tenant_due ON public.accounts_payable (tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_tenant_status ON public.accounts_payable (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.cash_flow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL,
  category TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_entries_tenant_date ON public.cash_flow_entries (tenant_id, date DESC);

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document TEXT,
  email TEXT,
  phone TEXT,
  position TEXT,
  monthly_salary NUMERIC(10, 2),
  work_center_id UUID REFERENCES public.work_centers (id) ON DELETE SET NULL,
  admission_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'vacation', 'terminated')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON public.employees (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status ON public.employees (tenant_id, status);

DROP TRIGGER IF EXISTS trg_accounts_payable_updated_at ON public.accounts_payable;

CREATE TRIGGER trg_accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_payable_select ON public.accounts_payable;
DROP POLICY IF EXISTS accounts_payable_insert ON public.accounts_payable;
DROP POLICY IF EXISTS accounts_payable_update ON public.accounts_payable;
DROP POLICY IF EXISTS accounts_payable_delete ON public.accounts_payable;

CREATE POLICY accounts_payable_select ON public.accounts_payable FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY accounts_payable_insert ON public.accounts_payable FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY accounts_payable_update ON public.accounts_payable FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY accounts_payable_delete ON public.accounts_payable FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

DROP POLICY IF EXISTS cash_flow_entries_select ON public.cash_flow_entries;
DROP POLICY IF EXISTS cash_flow_entries_insert ON public.cash_flow_entries;
DROP POLICY IF EXISTS cash_flow_entries_update ON public.cash_flow_entries;
DROP POLICY IF EXISTS cash_flow_entries_delete ON public.cash_flow_entries;

CREATE POLICY cash_flow_entries_select ON public.cash_flow_entries FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY cash_flow_entries_insert ON public.cash_flow_entries FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY cash_flow_entries_update ON public.cash_flow_entries FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY cash_flow_entries_delete ON public.cash_flow_entries FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_insert ON public.employees;
DROP POLICY IF EXISTS employees_update ON public.employees;
DROP POLICY IF EXISTS employees_delete ON public.employees;

CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

COMMENT ON TABLE public.accounts_payable IS 'Contas a pagar por tenant';

COMMENT ON TABLE public.cash_flow_entries IS 'Lançamentos manuais de fluxo de caixa (entradas/saídas)';

COMMENT ON TABLE public.employees IS 'Colaboradores (RH básico)';

UPDATE public.user_profiles
SET
  permissions = CASE
    WHEN permissions ? 'finance' THEN permissions
    ELSE COALESCE(permissions, '{}'::jsonb) || '{"finance": false}'::jsonb
  END;

UPDATE public.user_profiles
SET
  permissions = CASE
    WHEN permissions ? 'hr' THEN permissions
    ELSE COALESCE(permissions, '{}'::jsonb) || '{"hr": false}'::jsonb
  END;

NOTIFY pgrst, 'reload schema';
