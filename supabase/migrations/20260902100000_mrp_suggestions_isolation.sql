-- Etapa A (PCP/Produção): Sugestões do MRP no mesmo schema com isolamento.
--
-- Regras:
-- - Registros existentes continuam reais (is_suggestion = false).
-- - Sugestões do MRP ficam com is_suggestion = true e NÃO devem aparecer em telas/KPIs.
-- - production_orders: distingue origem (sales | stock | mrp_suggestion).

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'sales'
    CHECK (source_kind IN ('sales', 'stock', 'mrp_suggestion'));

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS is_suggestion BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_suggestion BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS is_suggestion BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS is_suggestion BOOLEAN NOT NULL DEFAULT false;

-- Backfill defensivo (caso algum ambiente tenha nulos)
UPDATE public.production_orders SET is_suggestion = false WHERE is_suggestion IS NULL;
UPDATE public.order_items SET is_suggestion = false WHERE is_suggestion IS NULL;
UPDATE public.purchase_orders SET is_suggestion = false WHERE is_suggestion IS NULL;
UPDATE public.purchase_order_items SET is_suggestion = false WHERE is_suggestion IS NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_suggestion
  ON public.production_orders (tenant_id, is_suggestion);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_suggestion
  ON public.purchase_orders (tenant_id, is_suggestion);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_suggestion
  ON public.purchase_order_items (tenant_id, is_suggestion);
CREATE INDEX IF NOT EXISTS idx_order_items_suggestion
  ON public.order_items (tenant_id, is_suggestion);

COMMENT ON COLUMN public.production_orders.is_suggestion IS
  'Sugestão do MRP (true) vs registro real (false).';
COMMENT ON COLUMN public.order_items.is_suggestion IS
  'Sugestão do MRP (true) vs registro real (false).';
COMMENT ON COLUMN public.purchase_orders.is_suggestion IS
  'Sugestão do MRP (true) vs pedido real (false).';
COMMENT ON COLUMN public.purchase_order_items.is_suggestion IS
  'Sugestão do MRP (true) vs item real (false).';
