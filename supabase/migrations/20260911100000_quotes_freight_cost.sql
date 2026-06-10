-- Valor do frete em orçamentos CIF (soma ao total).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotes.freight_cost IS
  'Valor do frete quando shipping_type = CIF; ignorado nos demais tipos.';

CREATE OR REPLACE FUNCTION public.quotes_recalc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total := ROUND(
    COALESCE(NEW.subtotal, 0)
    - COALESCE(NEW.discount, 0)
    + COALESCE(NEW.tax, 0)
    + CASE
        WHEN NEW.shipping_type = 'CIF' THEN COALESCE(NEW.freight_cost, 0)
        ELSE 0
      END,
    2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_recalc_total ON public.quotes;
CREATE TRIGGER trg_quotes_recalc_total
  BEFORE INSERT OR UPDATE OF subtotal, discount, tax, freight_cost, shipping_type
  ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.quotes_recalc_total();
