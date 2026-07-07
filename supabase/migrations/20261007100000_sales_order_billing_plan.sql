-- Intenção de faturamento (sem nota vs NF-e) definida antes do fechamento.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS billing_plan TEXT;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_billing_plan_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_billing_plan_check
  CHECK (
    billing_plan IS NULL
    OR billing_plan IN ('nfe', 'without_invoice')
  );

COMMENT ON COLUMN public.sales_orders.billing_plan IS
  'Intenção fiscal: null = ainda não definido; without_invoice = entrega sem NF-e; nfe = emitir nota.';

CREATE INDEX IF NOT EXISTS idx_sales_orders_billing_plan
  ON public.sales_orders (tenant_id, billing_plan)
  WHERE billing_plan IS NOT NULL;
