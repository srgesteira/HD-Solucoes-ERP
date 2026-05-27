-- Histórico de NF-e de compra (entrada) e conciliação com pedidos.

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  invoice_series TEXT,
  access_key TEXT,
  issue_date DATE,
  supplier_document TEXT,
  supplier_name TEXT,
  total_amount DECIMAL(14, 2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_tenant_supplier
  ON public.supplier_invoices (tenant_id, supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  line_index INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  product_code TEXT,
  quantity DECIMAL(12, 4) NOT NULL,
  unit TEXT DEFAULT 'UN',
  unit_price DECIMAL(12, 4) DEFAULT 0,
  total_price DECIMAL(14, 2) DEFAULT 0,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice
  ON public.supplier_invoice_items (supplier_invoice_id);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_invoices_tenant ON public.supplier_invoices;
CREATE POLICY supplier_invoices_tenant ON public.supplier_invoices
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS supplier_invoice_items_tenant ON public.supplier_invoice_items;
CREATE POLICY supplier_invoice_items_tenant ON public.supplier_invoice_items
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());
