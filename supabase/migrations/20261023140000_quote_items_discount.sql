-- Desconto por linha no orçamento (valor em R$).
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quote_items.discount IS
  'Desconto da linha em R$ (reduz o total_price da linha).';

CREATE OR REPLACE FUNCTION public.quote_items_line_total()
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

DROP TRIGGER IF EXISTS trg_quote_items_b_line_total ON public.quote_items;
CREATE TRIGGER trg_quote_items_b_line_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price, discount ON public.quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_items_line_total();
