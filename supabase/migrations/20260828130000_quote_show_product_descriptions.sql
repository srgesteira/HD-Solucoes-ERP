-- Preferência de impressão: incluir ou omitir descrição técnica dos produtos.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS show_product_descriptions BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.show_product_descriptions IS
  'Quando true, a impressão/PDF do orçamento inclui a descrição cadastrada no produto.';
