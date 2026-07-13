-- Alinha RFQ de compras ao fluxo de vendas (orçamento → pedido)
ALTER TABLE public.purchase_quote_requests
  DROP CONSTRAINT IF EXISTS purchase_quote_requests_status_check;

ALTER TABLE public.purchase_quote_requests
  ADD CONSTRAINT purchase_quote_requests_status_check
  CHECK (status IN ('draft', 'sent', 'converted', 'cancelled'));

ALTER TABLE public.purchase_quote_requests
  ADD COLUMN IF NOT EXISTS converted_to_purchase_order_id UUID
    REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS purchase_quote_request_id UUID
    REFERENCES public.purchase_quote_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_quote_requests_converted_po
  ON public.purchase_quote_requests (converted_to_purchase_order_id)
  WHERE converted_to_purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_quote_request
  ON public.purchase_orders (purchase_quote_request_id)
  WHERE purchase_quote_request_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_quote_requests.converted_to_purchase_order_id IS
  'Pedido de compra gerado a partir desta solicitação de orçamento (espelha quotes.converted_to_sale_id).';

COMMENT ON COLUMN public.purchase_orders.purchase_quote_request_id IS
  'Solicitação de orçamento de origem, quando o PC veio de uma RFQ.';
