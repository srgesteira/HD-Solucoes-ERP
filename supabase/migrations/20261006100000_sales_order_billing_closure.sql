-- Fechamento de faturamento: NF-e emitida ou entrega sem nota.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS billing_closure TEXT;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_billing_closure_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_billing_closure_check
  CHECK (
    billing_closure IS NULL
    OR billing_closure IN ('nfe', 'without_invoice')
  );

COMMENT ON COLUMN public.sales_orders.billing_closure IS
  'null = ciclo aberto; nfe = NF autorizada; without_invoice = entregue sem nota fiscal.';

CREATE INDEX IF NOT EXISTS idx_sales_orders_billing_closure
  ON public.sales_orders (tenant_id, billing_closure)
  WHERE billing_closure IS NOT NULL;
