-- =====================================================================
-- Itens de orçamento + condições de pagamento nos pedidos de venda
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'UN',
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_tenant ON public.quote_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON public.quote_items(product_id);

CREATE OR REPLACE FUNCTION public.quote_items_sync_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT q.tenant_id INTO STRICT NEW.tenant_id
  FROM public.quotes AS q
  WHERE q.id = NEW.quote_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_a_sync_tenant ON public.quote_items;
CREATE TRIGGER trg_quote_items_a_sync_tenant
  BEFORE INSERT OR UPDATE OF quote_id ON public.quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_items_sync_tenant();

CREATE OR REPLACE FUNCTION public.quote_items_line_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total_price := ROUND(
    COALESCE(NEW.quantity, 0)::NUMERIC * COALESCE(NEW.unit_price, 0)::NUMERIC,
    4
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_b_line_total ON public.quote_items;
CREATE TRIGGER trg_quote_items_b_line_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price ON public.quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_items_line_total();

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

  SELECT ROUND(
    COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0)::NUMERIC,
    2
  )
  INTO st
  FROM public.quote_items
  WHERE quote_id = p_quote_id;

  UPDATE public.quotes
  SET subtotal = st,
      updated_at = NOW()
  WHERE id = p_quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_quote_items_refresh_header()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.refresh_quote_subtotal(OLD.quote_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_quote_subtotal(NEW.quote_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.refresh_quote_subtotal(NEW.quote_id);
    IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
      PERFORM public.refresh_quote_subtotal(OLD.quote_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_refresh_header ON public.quote_items;
CREATE TRIGGER trg_quote_items_refresh_header
  AFTER INSERT OR DELETE OR UPDATE OF quantity, unit_price, quote_id
    ON public.quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_quote_items_refresh_header();

DROP TRIGGER IF EXISTS trg_quote_items_updated ON public.quote_items;
CREATE TRIGGER trg_quote_items_updated
  BEFORE UPDATE ON public.quote_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS payment_installments SMALLINT NOT NULL DEFAULT 1
    CONSTRAINT sales_orders_payment_installments_check CHECK (payment_installments >= 1 AND payment_installments <= 999);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS payment_days_to_first_due SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT sales_orders_payment_days_first_check CHECK (payment_days_to_first_due >= 0 AND payment_days_to_first_due <= 3650);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS payment_days_between_installments SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT sales_orders_payment_days_between_check
      CHECK (
        payment_days_between_installments >= 0 AND payment_days_between_installments <= 3650
      );

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_items_select ON public.quote_items
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY quote_items_insert ON public.quote_items
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY quote_items_update ON public.quote_items
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY quote_items_delete ON public.quote_items
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

NOTIFY pgrst, 'reload schema';
