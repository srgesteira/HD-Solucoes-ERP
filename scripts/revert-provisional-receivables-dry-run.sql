-- Dry-run: recebíveis que voltariam a provisório (is_forecast=true)
-- Critério: pending, is_forecast=false, com PV, pedido ainda NÃO entregue (status != delivered).

SELECT
  r.id,
  r.tenant_id,
  r.sales_order_id,
  so.order_number AS pv_numero,
  so.status AS pv_status,
  r.client_name,
  r.document_number,
  r.current_amount,
  r.due_date,
  r.is_forecast
FROM public.receivables r
JOIN public.sales_orders so ON so.id = r.sales_order_id
WHERE r.is_forecast = false
  AND r.status = 'pending'
  AND r.sales_order_id IS NOT NULL
  AND so.status IS DISTINCT FROM 'delivered'
ORDER BY so.order_number, r.installment_index;

-- Mantidos como real (pedido já entregue)
SELECT
  r.id,
  so.order_number AS pv_numero,
  so.status AS pv_status,
  r.client_name,
  r.current_amount
FROM public.receivables r
JOIN public.sales_orders so ON so.id = r.sales_order_id
WHERE r.is_forecast = false
  AND r.status = 'pending'
  AND r.sales_order_id IS NOT NULL
  AND so.status = 'delivered'
ORDER BY so.order_number;

-- Total a reverter
SELECT COUNT(*) AS titulos_a_reverter
FROM public.receivables r
JOIN public.sales_orders so ON so.id = r.sales_order_id
WHERE r.is_forecast = false
  AND r.status = 'pending'
  AND r.sales_order_id IS NOT NULL
  AND so.status IS DISTINCT FROM 'delivered';
