-- Preenche pedidos antigos sem prazo de entrega (uma vez): data do pedido + 30 dias.
UPDATE public.sales_orders
SET expected_delivery = (order_date + INTERVAL '30 days')::date
WHERE expected_delivery IS NULL;
