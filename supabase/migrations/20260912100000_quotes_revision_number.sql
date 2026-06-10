-- Revisões de orçamento após envio (ex.: ORC-2026-0518 - rev01)

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotes.revision_number IS
  'Incrementado ao guardar alterações após envio; exibido como rev01 no título.';
