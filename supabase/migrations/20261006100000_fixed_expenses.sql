-- Fatia 3: contas fixas recorrentes (fluxo futuro + centro Fixo do markup).

CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_day SMALLINT NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  cost_center_type TEXT NOT NULL DEFAULT 'fixed',
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fixed_expenses_end_after_start CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_tenant_active
  ON public.fixed_expenses (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_tenant_due_day
  ON public.fixed_expenses (tenant_id, due_day);

COMMENT ON TABLE public.fixed_expenses IS
  'Despesas fixas recorrentes: projetam saída mensal no fluxo e alimentam cost_center_type=fixed.';

CREATE TABLE IF NOT EXISTS public.fixed_expense_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  fixed_expense_id UUID NOT NULL REFERENCES public.fixed_expenses (id) ON DELETE CASCADE,
  competencia CHAR(7) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fixed_expense_overrides_competencia_fmt CHECK (
    competencia ~ '^\d{4}-\d{2}$'
  ),
  CONSTRAINT fixed_expense_overrides_unique UNIQUE (tenant_id, fixed_expense_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_fixed_expense_overrides_expense
  ON public.fixed_expense_overrides (tenant_id, fixed_expense_id);

COMMENT ON TABLE public.fixed_expense_overrides IS
  'Valor ajustado por competência (YYYY-MM) quando a conta fixa varia (ex.: energia).';

DROP TRIGGER IF EXISTS trg_fixed_expenses_updated_at ON public.fixed_expenses;

CREATE TRIGGER trg_fixed_expenses_updated_at
  BEFORE UPDATE ON public.fixed_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS trg_fixed_expense_overrides_updated_at ON public.fixed_expense_overrides;

CREATE TRIGGER trg_fixed_expense_overrides_updated_at
  BEFORE UPDATE ON public.fixed_expense_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expense_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fixed_expenses_select ON public.fixed_expenses;
DROP POLICY IF EXISTS fixed_expenses_insert ON public.fixed_expenses;
DROP POLICY IF EXISTS fixed_expenses_update ON public.fixed_expenses;
DROP POLICY IF EXISTS fixed_expenses_delete ON public.fixed_expenses;

CREATE POLICY fixed_expenses_select ON public.fixed_expenses
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY fixed_expenses_insert ON public.fixed_expenses
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY fixed_expenses_update ON public.fixed_expenses
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY fixed_expenses_delete ON public.fixed_expenses
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS fixed_expense_overrides_select ON public.fixed_expense_overrides;
DROP POLICY IF EXISTS fixed_expense_overrides_insert ON public.fixed_expense_overrides;
DROP POLICY IF EXISTS fixed_expense_overrides_update ON public.fixed_expense_overrides;
DROP POLICY IF EXISTS fixed_expense_overrides_delete ON public.fixed_expense_overrides;

CREATE POLICY fixed_expense_overrides_select ON public.fixed_expense_overrides
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY fixed_expense_overrides_insert ON public.fixed_expense_overrides
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY fixed_expense_overrides_update ON public.fixed_expense_overrides
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY fixed_expense_overrides_delete ON public.fixed_expense_overrides
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
