-- A coluna line_number pode estar na tabela mas fora do schema cache do PostgREST
-- (erro: Could not find the 'line_number' column of 'purchase_order_items').
-- Idempotente: cria se faltar, preenche nulos e recarrega o cache.

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS line_number integer;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS line_number integer;

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

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY quote_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.quote_items
  WHERE line_number IS NULL
)
UPDATE public.quote_items qi
SET line_number = numbered.rn
FROM numbered
WHERE qi.id = numbered.id;

UPDATE public.quote_items
SET line_number = 1
WHERE line_number IS NULL;

ALTER TABLE public.purchase_order_items
  ALTER COLUMN line_number SET DEFAULT 1;

ALTER TABLE public.quote_items
  ALTER COLUMN line_number SET DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items
    WHERE line_number IS NULL
  ) THEN
    ALTER TABLE public.purchase_order_items
      ALTER COLUMN line_number SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quote_items
    WHERE line_number IS NULL
  ) THEN
    ALTER TABLE public.quote_items
      ALTER COLUMN line_number SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchase_order_items_order_id_line_number_idx
  ON public.purchase_order_items (purchase_order_id, line_number)
  WHERE purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_order_items_quote_request_id_line_number_idx
  ON public.purchase_order_items (purchase_quote_request_id, line_number)
  WHERE purchase_quote_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quote_items_quote_id_line_number_idx
  ON public.quote_items (quote_id, line_number);

NOTIFY pgrst, 'reload schema';
