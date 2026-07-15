-- Fatia 2 padronização: observação por linha de item (nullable).
-- quote_items já tem client_notes (impressão/cliente); item_notes é obs operacional da linha.

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS item_notes text;

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS item_notes text;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS item_notes text;

COMMENT ON COLUMN public.quote_items.item_notes IS
  'Observação operacional da linha (embaixo da descrição). Distinto de client_notes (impressão).';
COMMENT ON COLUMN public.sales_order_items.item_notes IS
  'Observação da linha do pedido de venda.';
COMMENT ON COLUMN public.purchase_order_items.item_notes IS
  'Observação da linha do pedido de compra.';
