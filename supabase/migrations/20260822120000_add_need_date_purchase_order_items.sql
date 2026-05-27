-- Garantir coluna need_date (MRP / aba Requisições)
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS need_date DATE;

COMMENT ON COLUMN public.purchase_order_items.need_date IS
  'Data em que o material deve estar disponível (MRP).';

CREATE INDEX IF NOT EXISTS idx_poi_need_date_draft_requisitions
  ON public.purchase_order_items(tenant_id, need_date)
  WHERE purchase_order_id IS NULL AND status = 'draft';
