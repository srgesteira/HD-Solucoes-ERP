-- Requisições de compra: itens MRP sem pedido de compra vinculado
ALTER TABLE public.purchase_order_items
  ALTER COLUMN purchase_order_id DROP NOT NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'linked';

COMMENT ON COLUMN public.purchase_order_items.status IS
  'draft = requisição pendente (sem PC); linked = vinculado a purchase_orders';

UPDATE public.purchase_order_items
SET status = 'linked'
WHERE purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_requisitions
  ON public.purchase_order_items (tenant_id, status)
  WHERE purchase_order_id IS NULL AND status = 'draft';

-- tenant_id: só sincroniza a partir do PC quando purchase_order_id estiver definido
CREATE OR REPLACE FUNCTION public.purchase_order_items_sync_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT po.tenant_id INTO STRICT NEW.tenant_id
    FROM public.purchase_orders AS po
    WHERE po.id = NEW.purchase_order_id;
  END IF;
  RETURN NEW;
END;
$$;

-- subtotal do cabeçalho: ignora purchase_order_id nulo
CREATE OR REPLACE FUNCTION public.tr_purchase_order_items_refresh_header()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.refresh_purchase_order_subtotal(OLD.purchase_order_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_purchase_order_subtotal(NEW.purchase_order_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
      PERFORM public.refresh_purchase_order_subtotal(OLD.purchase_order_id);
      PERFORM public.refresh_purchase_order_subtotal(NEW.purchase_order_id);
    ELSE
      PERFORM public.refresh_purchase_order_subtotal(NEW.purchase_order_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
