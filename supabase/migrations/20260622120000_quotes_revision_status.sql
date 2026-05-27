-- Status de revisão + observações

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (
    status IN (
      'draft',
      'sent',
      'approved',
      'rejected',
      'converted',
      'revision'
    )
  );

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS revision_notes TEXT;

COMMENT ON COLUMN public.quotes.revision_notes IS
  'Motivo / observações quando o orçamento está em revisão (status = revision).';
