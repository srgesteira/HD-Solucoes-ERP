-- Views só-leitura: saldo futuro e em produção por produto (fatia 1 — fundação 4 estados).

CREATE OR REPLACE VIEW public.v_product_qty_in_production AS
SELECT
  oi.tenant_id,
  oi.product_id,
  COALESCE(SUM(oi.quantity), 0)::NUMERIC(14, 4) AS quantity_in_production
FROM public.order_items oi
INNER JOIN public.production_orders po ON po.id = oi.order_id
WHERE oi.is_suggestion = false
  AND oi.product_id IS NOT NULL
  AND oi.apontamento_end_at IS NULL
  AND oi.completed_at IS NULL
  AND oi.status <> 'completed'
  AND po.status IN ('imported', 'planning', 'in_production', 'ready', 'delayed')
GROUP BY oi.tenant_id, oi.product_id;

COMMENT ON VIEW public.v_product_qty_in_production IS
  'Qty de acabados/semi em produção (OP activa, item não finalizado).';

CREATE OR REPLACE VIEW public.v_product_qty_incoming AS
SELECT
  poi.tenant_id,
  poi.product_id,
  COALESCE(
    SUM(GREATEST(0, poi.quantity - COALESCE(poi.received_quantity, 0))),
    0
  )::NUMERIC(14, 4) AS quantity_incoming
FROM public.purchase_order_items poi
INNER JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
WHERE poi.product_id IS NOT NULL
  AND po.is_suggestion = false
  AND po.status IN ('confirmed', 'partial', 'sent')
GROUP BY poi.tenant_id, poi.product_id;

COMMENT ON VIEW public.v_product_qty_incoming IS
  'Qty pendente de recebimento em PCs abertos (saldo futuro).';

NOTIFY pgrst, 'reload schema';
