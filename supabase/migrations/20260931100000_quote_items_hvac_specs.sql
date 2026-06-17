-- Vertical HVAC V4 — especificações técnicas por linha de orçamento.

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS hvac_filter_class TEXT,
  ADD COLUMN IF NOT EXISTS hvac_airflow_m3h NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS hvac_cleanroom_class TEXT;

COMMENT ON COLUMN public.quote_items.hvac_filter_class IS
  'Vertical HVAC V4 — classe do filtro proposta nesta linha do orçamento.';
COMMENT ON COLUMN public.quote_items.hvac_airflow_m3h IS
  'Vertical HVAC V4 — vazão (m³/h) proposta nesta linha do orçamento.';

NOTIFY pgrst, 'reload schema';
