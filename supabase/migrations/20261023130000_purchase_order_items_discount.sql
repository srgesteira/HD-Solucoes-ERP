-- Desconto por linha no pedido de compra (valor em R$).
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.purchase_order_items.discount IS
  'Desconto da linha em R$ (reduz o subtotal da linha).';

CREATE OR REPLACE FUNCTION public.purchase_order_items_line_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total_price := ROUND(
    GREATEST(
      0::NUMERIC,
      COALESCE(NEW.quantity, 0)::NUMERIC * COALESCE(NEW.unit_price, 0)::NUMERIC
        - COALESCE(NEW.discount, 0)::NUMERIC
    ),
    4
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_line_total ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_line_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price, discount ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_items_line_total();
