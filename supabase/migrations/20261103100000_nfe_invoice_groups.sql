-- Agrupa vários pedidos de venda numa única NF-e.
-- A nota sai no pedido primário; os restantes fecham com a mesma autorização.
-- Números de cada PV (e PC do cliente) vão nas informações complementares.

CREATE TABLE IF NOT EXISTS public.nfe_invoice_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  primary_sales_order_id UUID NOT NULL REFERENCES public.sales_orders (id) ON DELETE RESTRICT,
  nfe_id UUID REFERENCES public.nfes (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nfe_invoice_groups_tenant_idx
  ON public.nfe_invoice_groups (tenant_id);

CREATE INDEX IF NOT EXISTS nfe_invoice_groups_primary_idx
  ON public.nfe_invoice_groups (primary_sales_order_id);

CREATE TABLE IF NOT EXISTS public.nfe_invoice_group_members (
  group_id UUID NOT NULL REFERENCES public.nfe_invoice_groups (id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders (id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, sales_order_id),
  CONSTRAINT nfe_invoice_group_members_order_unique UNIQUE (sales_order_id)
);

CREATE INDEX IF NOT EXISTS nfe_invoice_group_members_tenant_idx
  ON public.nfe_invoice_group_members (tenant_id, sales_order_id);

COMMENT ON TABLE public.nfe_invoice_groups IS
  'Agrupamento de PVs para emitir uma única NF-e (Bling).';
COMMENT ON TABLE public.nfe_invoice_group_members IS
  'Pedidos incluídos na mesma NF-e. Cada PV só pode estar num grupo.';

ALTER TABLE public.nfe_invoice_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_invoice_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_invoice_groups_tenant_all ON public.nfe_invoice_groups;
CREATE POLICY nfe_invoice_groups_tenant_all
  ON public.nfe_invoice_groups
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS nfe_invoice_group_members_tenant_all ON public.nfe_invoice_group_members;
CREATE POLICY nfe_invoice_group_members_tenant_all
  ON public.nfe_invoice_group_members
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';

GRANT ALL ON public.nfe_invoice_groups TO service_role;
GRANT ALL ON public.nfe_invoice_group_members TO service_role;
