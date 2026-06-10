-- Origem e utilizador nos movimentos de estoque (extrato).

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.user_profiles(id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_origin_ref
  ON public.inventory_movements (tenant_id, origin, reference_id, product_id, movement_type)
  WHERE reference_id IS NOT NULL AND origin IS NOT NULL;

COMMENT ON COLUMN public.inventory_movements.origin IS
  'purchase_receive | purchase_invoice | production_supply | production_finish | manual_adjust';
