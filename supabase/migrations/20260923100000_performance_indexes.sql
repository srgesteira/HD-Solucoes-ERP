-- Índices para queries quentes (MRP, alertas menu, disponibilidade).

CREATE INDEX IF NOT EXISTS idx_order_items_tenant_product_active
  ON public.order_items (tenant_id, product_id)
  WHERE is_suggestion = false;

CREATE INDEX IF NOT EXISTS idx_sales_orders_mrp_pending
  ON public.sales_orders (tenant_id, status)
  WHERE mrp_processed = false;

CREATE INDEX IF NOT EXISTS idx_receivables_tenant_status_due
  ON public.receivables (tenant_id, status, due_date);

COMMENT ON INDEX public.idx_order_items_tenant_product_active IS
  'MRP/disponibilidade: order_items activos por produto.';
COMMENT ON INDEX public.idx_sales_orders_mrp_pending IS
  'Alertas PCP: pedidos com MRP pendente.';
COMMENT ON INDEX public.idx_receivables_tenant_status_due IS
  'Alertas financeiros: recebíveis por status e vencimento.';
