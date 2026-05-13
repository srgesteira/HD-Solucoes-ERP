-- Prefixos de produto: HD1–HD3 (linha comercial) + MP, SE, EB, MC, RV, AC (entrada alinhada à natureza).
-- O código técnico continua a usar o texto de `product_prefixes.code` como 1.º segmento (ex.: MP-A10A10-001).

ALTER TABLE public.product_prefixes
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

ALTER TABLE public.product_prefixes DROP CONSTRAINT IF EXISTS product_prefixes_code_check;

ALTER TABLE public.product_prefixes
  ADD CONSTRAINT product_prefixes_code_check CHECK (
    code IN ('HD1', 'HD2', 'HD3', 'MP', 'SE', 'EB', 'MC', 'RV', 'AC')
  );

COMMENT ON COLUMN public.product_prefixes.code IS
  '1.º segmento do código técnico: HD1–HD3 ou MP/SE/EB/MC/RV/AC. MRP continua a usar products.product_nature.';

UPDATE public.product_prefixes SET sort_order = 1 WHERE code = 'HD1';

UPDATE public.product_prefixes SET sort_order = 2 WHERE code = 'HD2';

UPDATE public.product_prefixes SET sort_order = 3 WHERE code = 'HD3';

INSERT INTO public.product_prefixes (tenant_id, code, name, is_active, sort_order)
SELECT
  t.id,
  v.code,
  v.name,
  true,
  v.sort_order
FROM
  public.tenants t
  CROSS JOIN (
    VALUES
      ('MP', 'Matéria Prima', 10),
      ('SE', 'Semi Elaborado', 11),
      ('EB', 'Embalagem', 12),
      ('MC', 'Material de Consumo', 13),
      ('RV', 'Revenda', 14),
      ('AC', 'Acabado', 15)
  ) AS v(code, name, sort_order)
ON CONFLICT ON CONSTRAINT product_prefixes_tenant_code DO NOTHING;
