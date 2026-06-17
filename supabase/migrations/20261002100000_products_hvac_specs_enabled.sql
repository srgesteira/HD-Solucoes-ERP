-- HVAC opcional por produto: só exige ficha/checklist quando activado.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hvac_specs_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.hvac_specs_enabled IS
  'Vertical HVAC — quando true, ficha técnica, CQ e alertas de saúde do dado aplicam-se a este produto.';

UPDATE public.products
SET hvac_specs_enabled = true
WHERE
  hvac_filter_class IS NOT NULL
  OR hvac_airflow_m3h IS NOT NULL
  OR hvac_pressure_drop_pa IS NOT NULL
  OR hvac_cleanroom_class IS NOT NULL
  OR hvac_requires_integrity_test = true
  OR hvac_integrity_test_method IS NOT NULL;

NOTIFY pgrst, 'reload schema';
