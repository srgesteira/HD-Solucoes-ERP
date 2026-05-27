-- Requisições MRP: fornecedor sugerido e data de necessidade em purchase_order_items
-- APLIQUE antes de testar a aba Requisições: supabase db push
-- (ou cole este SQL no painel SQL do Supabase)

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS suggested_supplier_id UUID
  REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS need_date DATE;

COMMENT ON COLUMN public.purchase_order_items.suggested_supplier_id IS
  'Fornecedor sugerido para a requisição (override do preferred do produto).';
COMMENT ON COLUMN public.purchase_order_items.need_date IS
  'Data em que o material deve estar disponível (MRP).';

CREATE INDEX IF NOT EXISTS idx_poi_suggested_supplier
  ON public.purchase_order_items(suggested_supplier_id);

CREATE INDEX IF NOT EXISTS idx_poi_need_date_draft_requisitions
  ON public.purchase_order_items(tenant_id, need_date)
  WHERE purchase_order_id IS NULL AND status = 'draft';

-- Garantir constraint nomeada para PostgREST (embed suppliers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_order_items_suggested_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_suggested_supplier_id_fkey
      FOREIGN KEY (suggested_supplier_id)
      REFERENCES public.suppliers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ANALYZE public.purchase_order_items;
