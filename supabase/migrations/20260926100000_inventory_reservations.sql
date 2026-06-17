-- Frente 1: empenho automático — detalhe rastreável por origem.
-- inventory.reserved_quantity = SUM(quantity) das linhas activas abaixo.

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('production_order_item', 'sales_order_item')
  ),
  source_id UUID NOT NULL,
  production_order_id UUID REFERENCES public.production_orders (id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES public.order_items (id) ON DELETE SET NULL,
  sales_order_id UUID REFERENCES public.sales_orders (id) ON DELETE SET NULL,
  sales_order_item_id UUID REFERENCES public.sales_order_items (id) ON DELETE SET NULL,
  notes TEXT,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_tenant_product
  ON public.inventory_reservations (tenant_id, product_id)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_tenant_source
  ON public.inventory_reservations (tenant_id, source_kind, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservations_active_unique
  ON public.inventory_reservations (tenant_id, source_kind, source_id, product_id)
  WHERE released_at IS NULL;

DROP TRIGGER IF EXISTS trg_inventory_reservations_updated_at ON public.inventory_reservations;

CREATE TRIGGER trg_inventory_reservations_updated_at
  BEFORE UPDATE ON public.inventory_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_reservations_select ON public.inventory_reservations;

CREATE POLICY inventory_reservations_select ON public.inventory_reservations
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS inventory_reservations_modify ON public.inventory_reservations;

CREATE POLICY inventory_reservations_modify ON public.inventory_reservations
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

COMMENT ON TABLE public.inventory_reservations IS
  'Empenho rastreável por origem (OP item ou linha PV). Agregado em inventory.reserved_quantity.';

NOTIFY pgrst, 'reload schema';
