-- Fornecedor sugerido por requisição (override do preferred do produto)
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS suggested_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poi_suggested_supplier
  ON public.purchase_order_items(tenant_id, suggested_supplier_id)
  WHERE suggested_supplier_id IS NOT NULL;
