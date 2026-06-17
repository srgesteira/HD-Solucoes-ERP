-- Frente 6: roteiro N operações (template + instância na OP).

CREATE TABLE IF NOT EXISTS public.product_routing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  sequence INT NOT NULL CHECK (sequence >= 1),
  name TEXT NOT NULL,
  production_line_id UUID REFERENCES public.production_lines (id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers (id) ON DELETE SET NULL,
  default_duration_minutes INT CHECK (default_duration_minutes IS NULL OR default_duration_minutes >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_routing_steps_unique_seq UNIQUE (tenant_id, product_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.order_item_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE CASCADE,
  sequence INT NOT NULL CHECK (sequence >= 1),
  name TEXT NOT NULL,
  production_line_id UUID REFERENCES public.production_lines (id) ON DELETE SET NULL,
  work_center_id UUID REFERENCES public.work_centers (id) ON DELETE SET NULL,
  planned_duration_minutes INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'completed', 'skipped')
  ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_item_operations_unique_seq UNIQUE (tenant_id, order_item_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_product_routing_steps_product
  ON public.product_routing_steps (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_order_item_operations_item
  ON public.order_item_operations (tenant_id, order_item_id);

ALTER TABLE public.product_routing_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_routing_steps_tenant ON public.product_routing_steps
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY order_item_operations_tenant ON public.order_item_operations
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
