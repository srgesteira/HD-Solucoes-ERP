-- Planeamento PCP completo: linha padrão, MRP processado, prazos, apontamentos, picking e movimentos.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_production_line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.default_production_line_id IS 'Linha de fabricação padrão para produtos acabados.';

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS mrp_processed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sales_orders.mrp_processed IS 'Indica se o MRP já gerou OPs/compras/separação para este pedido.';

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS pcp_deadline DATE;

COMMENT ON COLUMN public.sales_order_items.pcp_deadline IS 'Prazo PCP por linha (sobrepõe o prazo do pedido).';

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS sales_order_item_id UUID REFERENCES public.sales_order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_sales_order_item
  ON public.purchase_order_items (tenant_id, sales_order_item_id)
  WHERE sales_order_item_id IS NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS quality_control TEXT,
  ADD COLUMN IF NOT EXISTS production_notes TEXT;

COMMENT ON COLUMN public.order_items.quality_control IS 'Resultado do controlo de qualidade na finalização.';
COMMENT ON COLUMN public.order_items.production_notes IS 'Observações de produção na finalização.';

CREATE TABLE IF NOT EXISTS public.picking_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity DECIMAL(12, 4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_picking_suggestions_tenant_order
  ON public.picking_suggestions (tenant_id, sales_order_id);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
  quantity DECIMAL(12, 4) NOT NULL,
  reason TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_product
  ON public.inventory_movements (tenant_id, product_id, created_at DESC);

ALTER TABLE public.picking_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS picking_suggestions_select ON public.picking_suggestions;
CREATE POLICY picking_suggestions_select ON public.picking_suggestions
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS picking_suggestions_insert ON public.picking_suggestions;
CREATE POLICY picking_suggestions_insert ON public.picking_suggestions
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS picking_suggestions_update ON public.picking_suggestions;
CREATE POLICY picking_suggestions_update ON public.picking_suggestions
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS inventory_movements_select ON public.inventory_movements;
CREATE POLICY inventory_movements_select ON public.inventory_movements
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS inventory_movements_insert ON public.inventory_movements;
CREATE POLICY inventory_movements_insert ON public.inventory_movements
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());
