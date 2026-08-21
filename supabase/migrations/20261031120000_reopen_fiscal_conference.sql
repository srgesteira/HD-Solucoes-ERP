-- Pedidos já marcados como alinhados voltam à conferência para preencher
-- frete, pagamento e restantes campos da NF-e. Notas autorizadas não mexem.
UPDATE public.sales_orders so
SET fiscal_status = 'review_required',
    updated_at = now()
WHERE so.billing_closure IS NULL
  AND so.fiscal_status IN ('rules_applied', 'manual_override', 'approved')
  AND NOT EXISTS (
    SELECT 1
    FROM public.nfes n
    WHERE n.sales_order_id = so.id
      AND n.status = 'authorized'
  );
