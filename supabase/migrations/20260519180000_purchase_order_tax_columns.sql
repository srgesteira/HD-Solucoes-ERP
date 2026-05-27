-- Totais no cabeçalho do pedido de compra
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_icms DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_ipi DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_tax_base DECIMAL(12, 2) DEFAULT 0;

-- Por item
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS icms_rate DECIMAL(5, 2) DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS icms_value DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS ipi_rate DECIMAL(5, 2) DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS ipi_value DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS tax_base DECIMAL(12, 2) DEFAULT 0;
