-- Material «Tinta» (T) e acabamento «Não se aplica» (00) para todos os tenants.
-- Remove CHECKs fixos (A/B/C e 10–13) para permitir códigos definidos no cadastro.

ALTER TABLE public.product_materials
  DROP CONSTRAINT IF EXISTS product_materials_code_check;

ALTER TABLE public.product_finishes
  DROP CONSTRAINT IF EXISTS product_finishes_code_check;

INSERT INTO public.product_materials (tenant_id, code, name)
SELECT
  t.id,
  'T',
  'Tinta'
FROM
  public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.product_finishes (tenant_id, code, name)
SELECT
  t.id,
  '00',
  'Não se aplica'
FROM
  public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;
