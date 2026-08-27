-- Ordem dos itens no pedido de compra (UI, impressão e PDF).
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS line_number integer;

COMMENT ON COLUMN public.purchase_order_items.line_number IS
  'Posição do item no pedido (1-based). Define a ordem no ecrã, impressão e PDF.';

-- Backfill estável por data de criação (e id como desempate), por pedido ou RFQ.
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(purchase_order_id, purchase_quote_request_id)
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.purchase_order_items
  WHERE line_number IS NULL
    AND (purchase_order_id IS NOT NULL OR purchase_quote_request_id IS NOT NULL)
)
UPDATE public.purchase_order_items poi
SET line_number = numbered.rn
FROM numbered
WHERE poi.id = numbered.id;

UPDATE public.purchase_order_items
SET line_number = 1
WHERE line_number IS NULL;

ALTER TABLE public.purchase_order_items
  ALTER COLUMN line_number SET NOT NULL,
  ALTER COLUMN line_number SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS purchase_order_items_order_id_line_number_idx
  ON public.purchase_order_items (purchase_order_id, line_number)
  WHERE purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_order_items_quote_request_id_line_number_idx
  ON public.purchase_order_items (purchase_quote_request_id, line_number)
  WHERE purchase_quote_request_id IS NOT NULL;
