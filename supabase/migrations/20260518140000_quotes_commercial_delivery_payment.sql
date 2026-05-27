-- Campos comerciais no orçamento (entrega prevista + condições de pagamento)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS payment_installments SMALLINT NOT NULL DEFAULT 1
    CONSTRAINT quotes_payment_installments_check
    CHECK (payment_installments >= 1 AND payment_installments <= 999),
  ADD COLUMN IF NOT EXISTS payment_days_to_first_due SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT quotes_payment_days_first_check
    CHECK (payment_days_to_first_due >= 0 AND payment_days_to_first_due <= 3650),
  ADD COLUMN IF NOT EXISTS payment_days_between_installments SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT quotes_payment_days_between_check
    CHECK (
      payment_days_between_installments >= 0
      AND payment_days_between_installments <= 3650
    );

COMMENT ON COLUMN public.quotes.expected_delivery_date IS
  'Data prevista de entrega ao cliente (comercial).';
COMMENT ON COLUMN public.quotes.payment_installments IS
  'Número de parcelas propostas no orçamento.';
COMMENT ON COLUMN public.quotes.payment_days_to_first_due IS
  'Dias até o vencimento da primeira parcela.';
COMMENT ON COLUMN public.quotes.payment_days_between_installments IS
  'Dias entre parcelas subsequentes.';
