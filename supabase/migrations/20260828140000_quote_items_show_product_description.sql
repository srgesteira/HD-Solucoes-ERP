-- Descrição do produto na impressão: preferência por linha do orçamento.
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS show_product_description BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quote_items.show_product_description IS
  'Quando true, a impressão/PDF inclui a descrição cadastrada no produto nesta linha.';
