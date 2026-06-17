-- Vertical HVAC V3 — checklist POP HEPA por produto + execução por linha de OP.

CREATE TABLE public.product_hvac_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT product_hvac_checklist_items_label_nonempty
    CHECK (length(trim(label)) > 0),
  CONSTRAINT product_hvac_checklist_items_sequence_positive
    CHECK (sequence > 0),
  UNIQUE (tenant_id, product_id, sequence)
);

COMMENT ON TABLE public.product_hvac_checklist_items IS
  'Vertical HVAC V3 — itens do checklist POP HEPA (template por produto).';

CREATE INDEX idx_product_hvac_checklist_items_product
  ON public.product_hvac_checklist_items (tenant_id, product_id, sequence);

CREATE TABLE public.hvac_checklist_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES public.product_hvac_checklist_items (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  notes TEXT,

  UNIQUE (tenant_id, order_item_id, checklist_item_id)
);

COMMENT ON TABLE public.hvac_checklist_completions IS
  'Vertical HVAC V3 — marcação de itens do checklist POP na CQ (por order_item).';

CREATE INDEX idx_hvac_checklist_completions_item
  ON public.hvac_checklist_completions (tenant_id, order_item_id);

ALTER TABLE public.product_hvac_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hvac_checklist_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_hvac_checklist_items_tenant_select"
  ON public.product_hvac_checklist_items;
CREATE POLICY "product_hvac_checklist_items_tenant_select"
  ON public.product_hvac_checklist_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "product_hvac_checklist_items_tenant_admin_write"
  ON public.product_hvac_checklist_items;
CREATE POLICY "product_hvac_checklist_items_tenant_admin_write"
  ON public.product_hvac_checklist_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "hvac_checklist_completions_tenant_select"
  ON public.hvac_checklist_completions;
CREATE POLICY "hvac_checklist_completions_tenant_select"
  ON public.hvac_checklist_completions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "hvac_checklist_completions_tenant_admin_write"
  ON public.hvac_checklist_completions;
CREATE POLICY "hvac_checklist_completions_tenant_admin_write"
  ON public.hvac_checklist_completions
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
