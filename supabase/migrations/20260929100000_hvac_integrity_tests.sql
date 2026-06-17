-- Vertical HVAC V2 — registo de teste de integridade (PAO/DOP) por linha de OP.

CREATE TABLE public.hvac_integrity_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,

  test_method TEXT NOT NULL,
  test_date DATE NOT NULL,
  result TEXT NOT NULL,
  leakage_rate NUMERIC(12, 4),
  notes TEXT,

  tested_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT hvac_integrity_tests_result_valid
    CHECK (result IN ('pass', 'fail')),

  CONSTRAINT hvac_integrity_tests_method_nonempty
    CHECK (length(trim(test_method)) > 0)
);

COMMENT ON TABLE public.hvac_integrity_tests IS
  'Vertical HVAC — histórico de testes de integridade (PAO/DOP) por order_item antes de expedir.';

CREATE INDEX idx_hvac_integrity_tests_item_history
  ON public.hvac_integrity_tests (tenant_id, order_item_id, test_date DESC, created_at DESC);

CREATE INDEX idx_hvac_integrity_tests_tenant
  ON public.hvac_integrity_tests (tenant_id);

ALTER TABLE public.hvac_integrity_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hvac_integrity_tests_tenant_select"
  ON public.hvac_integrity_tests;
CREATE POLICY "hvac_integrity_tests_tenant_select"
  ON public.hvac_integrity_tests
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "hvac_integrity_tests_tenant_admin_write"
  ON public.hvac_integrity_tests;
CREATE POLICY "hvac_integrity_tests_tenant_admin_write"
  ON public.hvac_integrity_tests
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
