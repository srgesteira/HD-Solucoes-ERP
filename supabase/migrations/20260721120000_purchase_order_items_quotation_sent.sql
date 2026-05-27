ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS quotation_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.purchase_order_items.quotation_sent_at IS
  'Data/hora do envio do pedido de orçamento ao fornecedor.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_quotation_sent
  ON public.purchase_order_items (tenant_id, quotation_sent_at)
  WHERE quotation_sent_at IS NOT NULL;
