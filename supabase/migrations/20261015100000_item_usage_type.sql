-- Fatia B: utilização do produto na linha (venda + compra).
-- Valores: consumo | materia_prima | revenda. Nullable — conferência fiscal avisa se vazio.

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS usage_type TEXT;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS usage_type TEXT;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS usage_type TEXT;

ALTER TABLE public.sales_order_items
  DROP CONSTRAINT IF EXISTS sales_order_items_usage_type_check;

ALTER TABLE public.sales_order_items
  ADD CONSTRAINT sales_order_items_usage_type_check
  CHECK (
    usage_type IS NULL
    OR usage_type IN ('consumo', 'materia_prima', 'revenda')
  );

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_usage_type_check;

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_usage_type_check
  CHECK (
    usage_type IS NULL
    OR usage_type IN ('consumo', 'materia_prima', 'revenda')
  );

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_usage_type_check;

ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_usage_type_check
  CHECK (
    usage_type IS NULL
    OR usage_type IN ('consumo', 'materia_prima', 'revenda')
  );

COMMENT ON COLUMN public.sales_order_items.usage_type IS
  'Utilização fiscal da linha: consumo | materia_prima | revenda. Nullable até conferência.';

COMMENT ON COLUMN public.purchase_order_items.usage_type IS
  'Utilização fiscal da linha: consumo | materia_prima | revenda. Nullable até conferência.';

COMMENT ON COLUMN public.quote_items.usage_type IS
  'Utilização fiscal da linha (copiada para sales_order_items na conversão).';

NOTIFY pgrst, 'reload schema';
