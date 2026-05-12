-- Unificar identificador do produto: apenas technical_code obrigatório; código manual opcional (legado).

-- 1) Garantir valor para linhas sem código técnico (antes de NOT NULL / unique completo)
UPDATE public.products
SET
  technical_code = 'LEG-' || REPLACE (id::TEXT, '-', '')
WHERE
  technical_code IS NULL;

-- 2) Remover índice único parcial antigo (constrangia apenas quando NOT NULL)
DROP INDEX IF EXISTS public.products_tenant_technical_code_uidx;

-- 3) Índice único por tenant + código técnico
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_technical_code_unique
  ON public.products (tenant_id, technical_code);

-- 4) Código técnico obrigatório
ALTER TABLE public.products
  ALTER COLUMN technical_code SET NOT NULL;

-- 5) Código legado opcional
ALTER TABLE public.products
  ALTER COLUMN code DROP NOT NULL;

COMMENT ON COLUMN public.products.technical_code IS 'Código técnico único do produto (gerado automaticamente)';

COMMENT ON COLUMN public.products.code IS 'Legado — usar technical_code';
