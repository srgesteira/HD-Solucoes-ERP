-- =============================================================================
-- Supabase → Dashboard → SQL Editor → colar este ficheiro completo → Run
--
-- O que faz:
--   A) Mostra o que já existe (tabela, colunas, constraint)
--   B) Cria a coluna product_nature se faltar
--   C) Lista produtos com natureza inválida (deve vir vazio antes do passo D)
--   D) Recria a constraint CHECK (valores permitidos: MP, SE, EB, MC, RV, AC ou NULL)
--   E) Estatísticas finais
--
-- Idempotente em condições normais. Se o passo D falhar, corrija as linhas do
-- passo C e volte a executar só a partir do passo D (ou o ficheiro inteiro).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) VERIFICAÇÕES (só leitura)
-- ---------------------------------------------------------------------------

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'products'
) AS tabela_products_existe;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name IN ('product_nature', 'has_composition')
ORDER BY column_name;

SELECT conname AS nome_constraint
FROM pg_constraint
WHERE conrelid = 'public.products'::regclass
  AND conname = 'products_product_nature_check';

-- ---------------------------------------------------------------------------
-- B) Coluna (criar se necessário)
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_nature TEXT;

-- ---------------------------------------------------------------------------
-- C) Valores inválidos — deve devolver 0 linhas antes do passo D
--     (se aparecerem linhas, faça UPDATE nesses ids e só depois execute D+E)
-- ---------------------------------------------------------------------------

SELECT
  id,
  technical_code,
  name,
  product_nature
FROM public.products
WHERE product_nature IS NOT NULL
  AND product_nature NOT IN ('MP', 'SE', 'EB', 'MC', 'RV', 'AC')
LIMIT 100;

-- ---------------------------------------------------------------------------
-- D) Constraint (recriar para garantir regra correta)
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_nature_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_nature_check
  CHECK (
    product_nature IS NULL
    OR product_nature IN ('MP', 'SE', 'EB', 'MC', 'RV', 'AC')
  );

COMMENT ON COLUMN public.products.product_nature IS
  'MP matéria-prima; SE semi-elaborado; EB embalagem; MC consumo; RV revenda; AC acabado. MRP usa para explosão BOM e OP.';

-- ---------------------------------------------------------------------------
-- E) Resumo após aplicar
-- ---------------------------------------------------------------------------

SELECT
  COUNT(*) FILTER (WHERE product_nature IS NULL) AS produtos_sem_natureza,
  COUNT(*) FILTER (WHERE product_nature IS NOT NULL) AS produtos_com_natureza,
  COUNT(*) AS total_produtos
FROM public.products;

SELECT product_nature, COUNT(*) AS quantidade
FROM public.products
WHERE product_nature IS NOT NULL
GROUP BY product_nature
ORDER BY product_nature;
