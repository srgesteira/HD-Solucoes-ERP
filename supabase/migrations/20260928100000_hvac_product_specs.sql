-- Vertical HVAC (§18): atributos técnicos de filtro / equipamento na ficha do produto.
-- Opcionais — só preenchidos em produtos acabados (AC, HD1–HD3).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hvac_filter_class TEXT,
  ADD COLUMN IF NOT EXISTS hvac_airflow_m3h NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS hvac_pressure_drop_pa NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS hvac_cleanroom_class TEXT,
  ADD COLUMN IF NOT EXISTS hvac_requires_integrity_test BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hvac_integrity_test_method TEXT;

COMMENT ON COLUMN public.products.hvac_filter_class IS
  'Vertical HVAC — classe do filtro (ex.: HEPA H13, H14, ULPA U15).';
COMMENT ON COLUMN public.products.hvac_requires_integrity_test IS
  'Vertical HVAC — exige registo de teste de integridade na CQ antes de expedir.';

NOTIFY pgrst, 'reload schema';
