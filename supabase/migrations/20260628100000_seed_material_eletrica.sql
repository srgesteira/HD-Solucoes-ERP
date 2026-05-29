-- Material «Material Elétrica» (E) para todos os tenants.

INSERT INTO public.product_materials (tenant_id, code, name, sort_order)
SELECT
  t.id,
  'E',
  'Material Elétrica',
  5
FROM
  public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;
