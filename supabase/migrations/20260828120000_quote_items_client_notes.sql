-- Observações por linha do orçamento (texto livre para o cliente na proposta/impressão).

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS client_notes TEXT;

COMMENT ON COLUMN public.quote_items.client_notes IS
  'Observações comerciais por item, visíveis ao cliente na impressão do orçamento.';
