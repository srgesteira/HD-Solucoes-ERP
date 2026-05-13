-- Mão-de-obra externa (terceiros): custo fixo sem centro de trabalho

ALTER TABLE public.product_components
  ADD COLUMN IF NOT EXISTS is_external_labor BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.product_components.is_external_labor IS
  'Se true, mão de obra externa (terceiros): work_center_id ignorado; unit_cost informado manualmente.';
