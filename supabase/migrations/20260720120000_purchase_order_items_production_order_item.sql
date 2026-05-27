-- Vínculo explícito da requisição ao item da ordem de produção (produto acabado)
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS production_order_item_id UUID
  REFERENCES public.order_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.purchase_order_items.production_order_item_id IS
  'Item da OP (order_items) do produto acabado que consome este material.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_production_order_item
  ON public.purchase_order_items (tenant_id, production_order_item_id)
  WHERE production_order_item_id IS NOT NULL;

-- Retrocompat: copiar de production_item_id quando existir
UPDATE public.purchase_order_items
SET production_order_item_id = production_item_id
WHERE production_order_item_id IS NULL
  AND production_item_id IS NOT NULL;
