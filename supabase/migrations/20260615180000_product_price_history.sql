-- Histórico de preços/custos (últimos 6 valores por tipo).

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  price_type TEXT NOT NULL CHECK (price_type IN ('purchase', 'production_cost', 'sale')),
  value NUMERIC(12, 4) NOT NULL,
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  position INT NOT NULL CHECK (position BETWEEN 1 AND 6),
  tax_deduction_percent NUMERIC(5, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_price_history_product_type_position_uidx UNIQUE (product_id, price_type, position)
);

CREATE INDEX IF NOT EXISTS idx_product_price_history_product
  ON public.product_price_history (product_id, price_type, position);

CREATE INDEX IF NOT EXISTS idx_product_price_history_tenant
  ON public.product_price_history (tenant_id);

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_price_history_tenant_select" ON public.product_price_history;
CREATE POLICY "product_price_history_tenant_select"
  ON public.product_price_history
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "product_price_history_tenant_admin_insert" ON public.product_price_history;
CREATE POLICY "product_price_history_tenant_admin_insert"
  ON public.product_price_history
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

DROP POLICY IF EXISTS "product_price_history_tenant_admin_update" ON public.product_price_history;
CREATE POLICY "product_price_history_tenant_admin_update"
  ON public.product_price_history
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "product_price_history_tenant_admin_delete" ON public.product_price_history;
CREATE POLICY "product_price_history_tenant_admin_delete"
  ON public.product_price_history
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

NOTIFY pgrst, 'reload schema';
