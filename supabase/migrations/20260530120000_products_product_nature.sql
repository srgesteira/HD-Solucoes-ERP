-- Natureza do produto (MRP: compra vs produção)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_nature TEXT;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_nature_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_nature_check
  CHECK (
    product_nature IS NULL
    OR product_nature IN ('MP', 'SE', 'EB', 'MC', 'RV', 'AC')
  );

COMMENT ON COLUMN public.products.product_nature IS
  'MP matéria-prima; SE semi-elaborado; EB embalagem; MC consumo; RV revenda; AC acabado. MRP usa para explosão BOM e OP.';
