-- Conferência fiscal de entrada finalizada (após recebimento físico em Compras).
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS fiscal_finalized_at timestamptz;

COMMENT ON COLUMN public.purchase_orders.fiscal_finalized_at IS
  'Timestamp em que o Faturamento finalizou a conferência fiscal de entrada. Só preenchido quando status = received.';

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_fiscal_finalized
  ON public.purchase_orders (tenant_id, fiscal_finalized_at)
  WHERE fiscal_finalized_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_received_pending_fiscal
  ON public.purchase_orders (tenant_id, status)
  WHERE status = 'received' AND fiscal_finalized_at IS NULL;
