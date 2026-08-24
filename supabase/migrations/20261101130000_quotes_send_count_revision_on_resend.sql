-- Conta quantas vezes o orçamento foi enviado ao cliente.
-- Revisão (rev01…) só incrementa a partir do 2.º envio.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotes.send_count IS
  'Quantas vezes o orçamento foi marcado/enviado como sent. Revisão sobe no reenvio.';

COMMENT ON COLUMN public.quotes.revision_number IS
  'Sufixo rev01…; incrementa apenas ao reenviar (não ao editar). Edição reabre como rascunho.';

-- Já enviados / aprovados / convertidos: pelo menos 1 envio efectivo.
UPDATE public.quotes
SET send_count = GREATEST(send_count, 1)
WHERE status IN ('sent', 'approved', 'converted', 'rejected')
   OR revision_number > 0;
