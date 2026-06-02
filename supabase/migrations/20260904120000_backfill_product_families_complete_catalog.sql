-- Garantir que famílias legadas (A–G, HD1…) ficam no catálogo completo partilhado (prefix_id NULL).

UPDATE public.product_families f
SET prefix_id = NULL
FROM public.product_prefixes p
WHERE f.tenant_id = p.tenant_id
  AND f.prefix_id = p.id
  AND p.code IN ('HD1', 'HD2', 'HD3', 'AC');

NOTIFY pgrst, 'reload schema';
