-- Famílias por sufixo: completos (HD1–HD3, AC) partilham catálogo; MP/SE/… têm o seu.

ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS prefix_id UUID REFERENCES public.product_prefixes (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.product_families.prefix_id IS
  'NULL = famílias dos sufixos de classificação completa (HD1, HD2, HD3, AC). Preenchido = família exclusiva desse sufixo (ex.: MP).';

-- Catálogo legado A–G passa a ser só para sufixos completos (prefix_id NULL).
UPDATE public.product_families
SET prefix_id = NULL
WHERE prefix_id IS NULL;

ALTER TABLE public.product_families
  DROP CONSTRAINT IF EXISTS product_families_tenant_code;

DROP INDEX IF EXISTS public.uq_product_families_tenant_code_complete;
CREATE UNIQUE INDEX uq_product_families_tenant_code_complete
  ON public.product_families (tenant_id, code)
  WHERE prefix_id IS NULL;

DROP INDEX IF EXISTS public.uq_product_families_tenant_prefix_code;
CREATE UNIQUE INDEX uq_product_families_tenant_prefix_code
  ON public.product_families (tenant_id, prefix_id, code)
  WHERE prefix_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_families_tenant_prefix
  ON public.product_families (tenant_id, prefix_id);

NOTIFY pgrst, 'reload schema';
