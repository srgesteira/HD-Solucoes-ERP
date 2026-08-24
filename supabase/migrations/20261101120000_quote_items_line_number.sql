-- Ordem dos itens no orçamento (UI, impressão e PDF).
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS line_number integer;

COMMENT ON COLUMN public.quote_items.line_number IS
  'Posição do item na proposta (1-based). Define a ordem no ecrã, impressão e PDF.';

-- Backfill estável por data de criação (e id como desempate).
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

ALTER TABLE public.quote_items
  ALTER COLUMN line_number SET NOT NULL,
  ALTER COLUMN line_number SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS quote_items_quote_id_line_number_idx
  ON public.quote_items (quote_id, line_number);
