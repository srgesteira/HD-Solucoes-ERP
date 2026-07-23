-- Subtotal do orçamento deve usar total líquido das linhas (já com desconto).
CREATE OR REPLACE FUNCTION public.refresh_quote_subtotal(p_quote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  st NUMERIC(12, 2);
BEGIN
  IF p_quote_id IS NULL THEN
    RETURN;
  END IF;

  SELECT ROUND(COALESCE(SUM(COALESCE(total_price, 0)), 0)::NUMERIC, 2)
  INTO st
  FROM public.quote_items
  WHERE quote_id = p_quote_id;

  UPDATE public.quotes
  SET subtotal = st,
      updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$;

-- Também refrescar cabeçalho quando o desconto da linha mudar.
DROP TRIGGER IF EXISTS trg_quote_items_refresh_header ON public.quote_items;
CREATE TRIGGER trg_quote_items_refresh_header
  AFTER INSERT OR DELETE OR UPDATE OF quantity, unit_price, discount, quote_id
    ON public.quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_quote_items_refresh_header();

-- Recalcular subtotais existentes (corrige orçamentos já gravados com desconto por item).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT q.id
    FROM public.quotes q
    INNER JOIN public.quote_items qi ON qi.quote_id = q.id
    WHERE COALESCE(qi.discount, 0) > 0
  LOOP
    PERFORM public.refresh_quote_subtotal(r.id);
  END LOOP;
END;
$$;
