-- Condições de pagamento no pedido de compra (espelho de sales_orders)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_installments SMALLINT NOT NULL DEFAULT 1
    CONSTRAINT purchase_orders_payment_installments_check
    CHECK (payment_installments >= 1 AND payment_installments <= 999);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_days_to_first_due SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT purchase_orders_payment_days_first_check
    CHECK (payment_days_to_first_due >= 0 AND payment_days_to_first_due <= 3650);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_days_between_installments SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT purchase_orders_payment_days_between_check
    CHECK (
      payment_days_between_installments >= 0
      AND payment_days_between_installments <= 3650
    );

COMMENT ON COLUMN public.purchase_orders.payment_installments IS
  'Número de parcelas de pagamento ao fornecedor.';
COMMENT ON COLUMN public.purchase_orders.payment_days_to_first_due IS
  'Dias até o vencimento da primeira parcela.';
COMMENT ON COLUMN public.purchase_orders.payment_days_between_installments IS
  'Dias entre parcelas subsequentes (0 = à vista após a primeira).';
