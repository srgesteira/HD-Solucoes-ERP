-- Direcionadores de rateio por departamento de apoio.

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS allocation_driver TEXT NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS driver_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.departments.allocation_driver IS
  'hours | purchase_orders | shipped_weight | movements_count';
COMMENT ON COLUMN public.departments.driver_config IS
  'Parâmetros opcionais do direcionador (JSON).';

ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_allocation_driver_chk;

ALTER TABLE public.departments
  ADD CONSTRAINT departments_allocation_driver_chk
  CHECK (
    allocation_driver IN (
      'hours',
      'purchase_orders',
      'shipped_weight',
      'movements_count'
    )
  );
