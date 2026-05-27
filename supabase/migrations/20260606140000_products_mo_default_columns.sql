-- Campos padrão de MO no cadastro do produto (substitui is_external_labor)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_is_external_labor BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_labor_cost NUMERIC(14, 4);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'products'
      AND c.column_name = 'is_external_labor'
  ) THEN
    UPDATE public.products
    SET default_is_external_labor = is_external_labor;
  END IF;
END $$;

ALTER TABLE public.products DROP COLUMN IF EXISTS is_external_labor;

COMMENT ON COLUMN public.products.default_is_external_labor IS
  'Prefixo MO: true = mão-de-obra externa (usa default_labor_cost na BOM); false = interna (usa default_work_center_id).';

COMMENT ON COLUMN public.products.default_labor_cost IS
  'Prefixo MO externa: custo unitário padrão (R$/hora ou por unidade) sugerido na BOM.';
