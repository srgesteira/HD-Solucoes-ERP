-- Frente 6: backfill operações para itens de OP existentes (1 operação padrão).

INSERT INTO public.order_item_operations (
  tenant_id,
  order_item_id,
  sequence,
  name,
  production_line_id,
  status
)
SELECT
  oi.tenant_id,
  oi.id,
  1,
  COALESCE(NULLIF(TRIM(p.name), ''), 'Produção'),
  COALESCE(oi.line_id, p.default_production_line_id),
  'pending'
FROM public.order_items oi
LEFT JOIN public.products p ON p.id = oi.product_id
WHERE oi.is_suggestion IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_item_operations op
    WHERE op.order_item_id = oi.id
  );

NOTIFY pgrst, 'reload schema';
