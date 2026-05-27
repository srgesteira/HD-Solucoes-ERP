-- Prefixo MO (catálogo de mão-de-obra como produto) + campos de serviço MO no produto

ALTER TABLE public.product_prefixes DROP CONSTRAINT IF EXISTS product_prefixes_code_check;

ALTER TABLE public.product_prefixes
  ADD CONSTRAINT product_prefixes_code_check CHECK (
    code IN ('HD1', 'HD2', 'HD3', 'MP', 'SE', 'EB', 'MC', 'RV', 'AC', 'MO')
  );

INSERT INTO public.product_prefixes (tenant_id, code, name, is_active, sort_order)
SELECT
  t.id,
  'MO',
  'Mão de Obra',
  true,
  20
FROM
  public.tenants t
ON CONFLICT ON CONSTRAINT product_prefixes_tenant_code DO NOTHING;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_external_labor BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_work_center_id UUID REFERENCES public.work_centers (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.is_external_labor IS
  'Quando o prefixo do produto é MO: true = serviço de MO externa (custo fixo); false = MO interna (usa centro).';

COMMENT ON COLUMN public.products.default_work_center_id IS
  'Para produto MO interna: centro de trabalho sugerido na BOM (opcional).';

CREATE INDEX IF NOT EXISTS idx_products_default_work_center_id
  ON public.products (default_work_center_id)
  WHERE default_work_center_id IS NOT NULL;
