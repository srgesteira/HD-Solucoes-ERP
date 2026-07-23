-- Pedido de compra do cliente (referência para NF-e / xPed).

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS customer_po_number TEXT;

COMMENT ON COLUMN public.sales_orders.customer_po_number IS
  'N.º do pedido de compra do cliente (obrigatório na conversão do orçamento; vai na NF-e).';

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_po_number
  ON public.sales_orders (tenant_id, customer_po_number)
  WHERE customer_po_number IS NOT NULL;
