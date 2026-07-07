-- Dry-run: pagáveis que voltariam a provisório (is_forecast=true)
-- Critério: pending, is_forecast=false, com PC, pedido ainda NÃO recebido (status != received).

SELECT
  ap.id,
  ap.tenant_id,
  ap.purchase_order_id,
  po.po_number,
  po.status AS pc_status,
  ap.description,
  ap.current_amount,
  ap.due_date,
  ap.is_forecast
FROM public.accounts_payable ap
JOIN public.purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.is_forecast = false
  AND ap.status = 'pending'
  AND ap.purchase_order_id IS NOT NULL
  AND po.status IS DISTINCT FROM 'received'
ORDER BY po.po_number, ap.installment_index;

SELECT COUNT(*) AS titulos_a_reverter
FROM public.accounts_payable ap
JOIN public.purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.is_forecast = false
  AND ap.status = 'pending'
  AND ap.purchase_order_id IS NOT NULL
  AND po.status IS DISTINCT FROM 'received';
