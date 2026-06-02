-- Etapa B: apontamento real (TIMESTAMPTZ) separado da programação (DATE).
-- Programação: production_start / production_end (plano).
-- Apontamento: apontamento_start_at / apontamento_end_at (início/fim reais na linha).

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS apontamento_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apontamento_end_at TIMESTAMPTZ;

COMMENT ON COLUMN public.order_items.apontamento_start_at IS
  'Início real do apontamento na linha (não altera production_start programado).';
COMMENT ON COLUMN public.order_items.apontamento_end_at IS
  'Fim real do apontamento na linha (não altera production_end programado).';

-- Alinha CHECK ao código (OP estoque usa planning; start-production usa in_progress).
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_status_check
  CHECK (status IN (
    'waiting',
    'scheduled',
    'planning',
    'in_progress',
    'completed',
    'delayed'
  ));

CREATE INDEX IF NOT EXISTS idx_order_items_apontamento_active
  ON public.order_items (tenant_id, line_id, apontamento_end_at)
  WHERE is_suggestion = false;
