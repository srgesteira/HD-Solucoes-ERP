-- Flag comercial: pedido liberado para faturamento (PCP concluiu produção).

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS ready_for_invoice BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_orders.ready_for_invoice IS
  'True quando o PCP concluiu todos os itens e o pedido pode ser faturado.';

CREATE INDEX IF NOT EXISTS idx_sales_orders_ready_for_invoice
  ON public.sales_orders (tenant_id, ready_for_invoice)
  WHERE ready_for_invoice = true;
