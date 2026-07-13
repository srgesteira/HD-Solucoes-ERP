-- Incluir descrição do produto na impressão (espelha quote_items.show_product_description)
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS show_product_description BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_order_items.show_product_description IS
  'Se true, a impressão da RFQ/PC mostra a descrição cadastrada do produto sob o nome.';
