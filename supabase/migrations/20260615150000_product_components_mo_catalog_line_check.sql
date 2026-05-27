-- Permite linha de BOM com produto catálogo MO (is_labor + component_product_id).
-- A constraint product_components_line_kind_check NÃO é a coluna line_kind; valida o "tipo" da linha.

ALTER TABLE public.product_components
  DROP CONSTRAINT IF EXISTS product_components_line_kind_check;

ALTER TABLE public.product_components
  ADD CONSTRAINT product_components_line_kind_check CHECK (
    -- Material: produto componente obrigatório
    (
      COALESCE(is_labor, FALSE) = FALSE
      AND component_product_id IS NOT NULL
    )
    OR
    -- Mão-de-obra com produto catálogo (ex.: prefixo MO)
    (
      COALESCE(is_labor, FALSE) = TRUE
      AND component_product_id IS NOT NULL
    )
    OR
    -- Mão-de-obra interna sem produto (só centro + horas)
    (
      COALESCE(is_labor, FALSE) = TRUE
      AND component_product_id IS NULL
      AND COALESCE(is_external_labor, FALSE) = FALSE
      AND work_center_id IS NOT NULL
    )
    OR
    -- Mão-de-obra externa sem produto (custo fixo, sem centro)
    (
      COALESCE(is_labor, FALSE) = TRUE
      AND component_product_id IS NULL
      AND COALESCE(is_external_labor, FALSE) = TRUE
      AND work_center_id IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
