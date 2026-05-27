-- Impostos por item e totais no pedido de compra (IPI sobre subtotal; ICMS sobre subtotal + IPI).

-- Cabeçalho
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_icms DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_ipi DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS total_tax_base DECIMAL(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.purchase_orders.total_icms IS
  'Soma dos valores de ICMS dos itens.';

COMMENT ON COLUMN public.purchase_orders.total_ipi IS
  'Soma dos valores de IPI dos itens.';

COMMENT ON COLUMN public.purchase_orders.total_tax_base IS
  'Soma das bases de cálculo (subtotal + IPI) dos itens.';

-- Itens
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS icms_rate DECIMAL(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS icms_value DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS ipi_rate DECIMAL(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS ipi_value DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS tax_base DECIMAL(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.purchase_order_items.icms_rate IS
  'Alíquota ICMS (%) sobre a base (subtotal + IPI).';

COMMENT ON COLUMN public.purchase_order_items.icms_value IS
  'Valor ICMS (R$) da linha.';

COMMENT ON COLUMN public.purchase_order_items.ipi_rate IS
  'Alíquota IPI (%) sobre o subtotal da linha.';

COMMENT ON COLUMN public.purchase_order_items.ipi_value IS
  'Valor IPI (R$) da linha.';

COMMENT ON COLUMN public.purchase_order_items.tax_base IS
  'Base de cálculo do ICMS: subtotal + IPI.';

-- Compatibilidade: nomes antigos da migration anterior (se aplicada em algum ambiente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_order_items'
      AND column_name = 'icms_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_order_items'
      AND column_name = 'icms_value'
  ) THEN
    ALTER TABLE public.purchase_order_items RENAME COLUMN icms_amount TO icms_value;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_order_items'
      AND column_name = 'ipi_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_order_items'
      AND column_name = 'ipi_value'
  ) THEN
    ALTER TABLE public.purchase_order_items RENAME COLUMN ipi_amount TO ipi_value;
  END IF;
END $$;
