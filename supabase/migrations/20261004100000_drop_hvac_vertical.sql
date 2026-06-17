-- Remove vertical HVAC/ISO (tabelas dedicadas + colunas em produtos, linhas e orçamentos).
-- Aplicar após deploy do código sem referências HVAC.

DROP TABLE IF EXISTS public.hvac_checklist_completions;
DROP TABLE IF EXISTS public.product_hvac_checklist_items;
DROP TABLE IF EXISTS public.hvac_integrity_tests;

ALTER TABLE public.quote_items
  DROP COLUMN IF EXISTS hvac_filter_class,
  DROP COLUMN IF EXISTS hvac_airflow_m3h,
  DROP COLUMN IF EXISTS hvac_cleanroom_class;

ALTER TABLE public.production_lines
  DROP COLUMN IF EXISTS hvac_cleanroom_class;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS hvac_filter_class,
  DROP COLUMN IF EXISTS hvac_airflow_m3h,
  DROP COLUMN IF EXISTS hvac_pressure_drop_pa,
  DROP COLUMN IF EXISTS hvac_cleanroom_class,
  DROP COLUMN IF EXISTS hvac_requires_integrity_test,
  DROP COLUMN IF EXISTS hvac_integrity_test_method,
  DROP COLUMN IF EXISTS hvac_specs_enabled;

NOTIFY pgrst, 'reload schema';
