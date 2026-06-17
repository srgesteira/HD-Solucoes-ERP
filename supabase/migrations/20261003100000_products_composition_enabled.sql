-- Composição opcional: HD1/HD2/AC activam BOM explicitamente; HD3 (revenda) nunca tem composição.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS composition_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.composition_enabled IS
  'Quando true, o produto usa receita (BOM). HD3 revenda permanece sempre false.';

-- Produtos que já tinham BOM activa
UPDATE public.products p
SET composition_enabled = true
WHERE EXISTS (
  SELECT 1
  FROM public.product_components pc
  WHERE pc.parent_product_id = p.id
    AND pc.tenant_id = p.tenant_id
);

-- HD3 = produtos revendidos — nunca composição
UPDATE public.products p
SET composition_enabled = false
FROM public.product_prefixes pp
WHERE p.prefix_id = pp.id
  AND pp.code = 'HD3';

NOTIFY pgrst, 'reload schema';
