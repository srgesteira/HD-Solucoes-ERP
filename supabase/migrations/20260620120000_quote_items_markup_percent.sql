-- Markup percentual por linha de orçamento

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(8, 4);

COMMENT ON COLUMN public.quote_items.markup_percent IS
  'Markup sobre cost_price do produto (%) usado para calcular unit_price.';
