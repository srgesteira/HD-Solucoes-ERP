-- Abastecimento de produção: regista quando o almoxarifado baixou materiais da OP.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS warehouse_supplied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warehouse_supplied_by UUID REFERENCES public.user_profiles(id);

CREATE INDEX IF NOT EXISTS idx_order_items_warehouse_pending
  ON public.order_items (tenant_id, warehouse_supplied_at)
  WHERE warehouse_supplied_at IS NULL AND is_suggestion = false;

COMMENT ON COLUMN public.order_items.warehouse_supplied_at IS
  'Momento em que o almoxarifado confirmou abastecimento (baixa de estoque BOM).';
