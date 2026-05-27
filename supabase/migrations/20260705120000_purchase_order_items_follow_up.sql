-- Cronograma de compras PCP: lembrete de follow-up com fornecedor.

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;

COMMENT ON COLUMN public.purchase_order_items.follow_up_date IS
  'Data para acompanhamento / contacto com o fornecedor (cronograma PCP).';

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_follow_up
  ON public.purchase_order_items (tenant_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL;
