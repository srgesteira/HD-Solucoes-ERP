-- Frente 2: backfill has_composition a partir de product_components (dry-run documentado abaixo).
--
-- SELECT de verificação (executar antes):
-- SELECT p.id, p.technical_code, p.has_composition AS flag_atual,
--        EXISTS (SELECT 1 FROM product_components pc WHERE pc.parent_product_id = p.id AND pc.tenant_id = p.tenant_id) AS tem_bom
-- FROM products p
-- WHERE p.has_composition IS DISTINCT FROM EXISTS (
--   SELECT 1 FROM product_components pc WHERE pc.parent_product_id = p.id AND pc.tenant_id = p.tenant_id
-- );

UPDATE public.products p
SET has_composition = EXISTS (
  SELECT 1
  FROM public.product_components pc
  WHERE pc.parent_product_id = p.id
    AND pc.tenant_id = p.tenant_id
);
