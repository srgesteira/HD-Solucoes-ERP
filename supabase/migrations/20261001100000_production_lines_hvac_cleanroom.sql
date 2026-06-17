-- Vertical HVAC V5: classe ISO da área classificada por linha de produção.

ALTER TABLE public.production_lines
  ADD COLUMN IF NOT EXISTS hvac_cleanroom_class TEXT;

COMMENT ON COLUMN public.production_lines.hvac_cleanroom_class IS
  'Vertical HVAC V5 — classe ISO da área classificada desta linha (ex.: ISO 7).';

NOTIFY pgrst, 'reload schema';
