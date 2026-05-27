-- Custos adicionais do pedido de compra (rateados no recebimento).

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS freight_cost DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS insurance_cost DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS other_costs DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_tax_non_creditable DECIMAL(12, 2) NOT NULL DEFAULT 0;
