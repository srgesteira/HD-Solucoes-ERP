-- Pedido de venda no Bling, preparado na conferência fiscal antes de emitir a NF-e.
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS bling_pedido_venda_id BIGINT,
  ADD COLUMN IF NOT EXISTS bling_pedido_prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bling_natureza_operacao_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_sales_orders_bling_pedido
  ON public.sales_orders (tenant_id, bling_pedido_venda_id)
  WHERE bling_pedido_venda_id IS NOT NULL;

COMMENT ON COLUMN public.sales_orders.bling_pedido_venda_id IS
  'ID do pedido de venda no Bling (POST /pedidos/vendas). A NF-e é emitida a partir deste pedido.';
COMMENT ON COLUMN public.sales_orders.bling_pedido_prepared_at IS
  'Quando o pedido foi criado/atualizado no Bling a partir da conferência fiscal.';
COMMENT ON COLUMN public.sales_orders.bling_natureza_operacao_id IS
  'Natureza de operação Bling escolhida pelo CFOP da conferência.';
