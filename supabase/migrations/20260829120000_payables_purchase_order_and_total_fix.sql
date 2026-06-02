-- Contas a pagar ligadas a pedidos de compra + trava de ajuste manual.
-- Alinha total do cabeçalho do PC com subtotal − desconto + imposto + IPI + custos extras.

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders (id) ON DELETE SET NULL;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS installment_index SMALLINT;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS is_forecast BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS amount_locked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_purchase_order
  ON public.accounts_payable (tenant_id, purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

COMMENT ON COLUMN public.accounts_payable.purchase_order_id IS
  'Pedido de compra que originou a parcela (quando source_kind = purchase_order).';
COMMENT ON COLUMN public.accounts_payable.source_kind IS
  'Origem: manual | purchase_order.';
COMMENT ON COLUMN public.accounts_payable.installment_index IS
  'Índice da parcela (1..N) quando gerada a partir do PC.';
COMMENT ON COLUMN public.accounts_payable.is_forecast IS
  'Previsão (ex.: antes do recebimento); títulos efetivos usam false.';
COMMENT ON COLUMN public.accounts_payable.amount_locked IS
  'Quando true, recálculo automático do PC não altera valores desta linha.';

UPDATE public.accounts_payable
SET source_kind = 'purchase_order'
WHERE purchase_order_id IS NOT NULL
  AND (source_kind IS NULL OR source_kind = 'manual');

-- Remove triggers legados de geração de CP no PC (se existirem só em produção).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'purchase_orders'
      AND NOT t.tgisinternal
      AND (
        t.tgname ILIKE '%payable%'
        OR t.tgname ILIKE '%accounts_payable%'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.purchase_orders',
      r.tgname
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Total do pedido = subtotal − desconto + tax + IPI + frete/seguro/outros/imp. não creditável
-- (espelha computePurchaseOrderTotal no app; ICMS é informativo no cabeçalho)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_orders_recalc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total := ROUND(
    GREATEST(
      0,
      COALESCE(NEW.subtotal, 0)
        - COALESCE(NEW.discount, 0)
        + COALESCE(NEW.tax, 0)
        + COALESCE(NEW.total_ipi, 0)
        + COALESCE(NEW.freight_cost, 0)
        + COALESCE(NEW.insurance_cost, 0)
        + COALESCE(NEW.other_costs, 0)
        + COALESCE(NEW.total_tax_non_creditable, 0)
    )::NUMERIC,
    2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_recalc_total ON public.purchase_orders;

CREATE TRIGGER trg_purchase_orders_recalc_total
  BEFORE INSERT OR UPDATE OF
    subtotal,
    discount,
    tax,
    total_ipi,
    freight_cost,
    insurance_cost,
    other_costs,
    total_tax_non_creditable
  ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_orders_recalc_total();
