-- Linhas de BOM: mão-de-obra sem produto componente (só centro de trabalho + horas).

ALTER TABLE public.product_components
  DROP CONSTRAINT IF EXISTS product_components_line_kind_check;

ALTER TABLE public.product_components
  ALTER COLUMN component_product_id DROP NOT NULL;

ALTER TABLE public.product_components
  ADD CONSTRAINT product_components_line_kind_check CHECK (
    (COALESCE(is_labor, false) = false AND component_product_id IS NOT NULL)
    OR
    (COALESCE(is_labor, false) = true AND work_center_id IS NOT NULL AND component_product_id IS NULL)
  );

NOTIFY pgrst, 'reload schema';
