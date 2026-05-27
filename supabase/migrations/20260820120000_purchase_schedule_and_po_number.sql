-- Cronograma de compras: datas por linha, lead time, numeração PC automática

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_lead_time_days INTEGER;

COMMENT ON COLUMN public.products.purchase_lead_time_days IS
  'Lead time de compra em dias (MRP: need_date = pcp_deadline - lead_time).';

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS need_date DATE,
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS actual_delivery_date DATE;

COMMENT ON COLUMN public.purchase_order_items.need_date IS
  'Data em que o material deve estar disponível (MRP).';
COMMENT ON COLUMN public.purchase_order_items.expected_delivery_date IS
  'Previsão de entrega do fornecedor (linha).';
COMMENT ON COLUMN public.purchase_order_items.actual_delivery_date IS
  'Entrega real do fornecedor (linha).';

CREATE INDEX IF NOT EXISTS idx_poi_sales_order_item_delivery
  ON public.purchase_order_items(tenant_id, sales_order_item_id, expected_delivery_date)
  WHERE sales_order_item_id IS NOT NULL;

-- Numeração PC-YYYY-NNNNN por tenant e ano (apenas quando po_number vazio)
CREATE OR REPLACE FUNCTION public.generate_purchase_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  year_part TEXT;
  next_seq INT;
BEGIN
  IF NEW.po_number IS NOT NULL AND LENGTH(TRIM(NEW.po_number)) > 0 THEN
    RETURN NEW;
  END IF;

  year_part := to_char(COALESCE(NEW.order_date, CURRENT_DATE), 'YYYY');

  SELECT
    COALESCE(
      MAX(
        (regexp_match(po.po_number, '^PC-' || year_part || '-([0-9]+)$'))[1]::INT
      ),
      0
    ) + 1 INTO next_seq
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = NEW.tenant_id
    AND po.po_number ~ ('^PC-' || year_part || '-[0-9]+$');

  NEW.po_number := 'PC-' || year_part || '-' || lpad(next_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_po_number_before_insert ON public.purchase_orders;

CREATE TRIGGER set_po_number_before_insert
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_purchase_order_number();
