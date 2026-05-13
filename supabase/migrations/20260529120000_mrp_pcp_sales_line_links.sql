-- MRP/PCP: linha de venda numerada, OP por linha, rastreio de compras, prazo PCP no pedido.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS pcp_deadline DATE;

COMMENT ON COLUMN public.sales_orders.pcp_deadline IS 'Prazo interno estipulado pelo PCP (além de expected_delivery do cliente).';

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS line_number INTEGER,
  ADD COLUMN IF NOT EXISTS production_order_id UUID REFERENCES public.production_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales_order_items.line_number IS 'Posição da linha no pedido (1,2,…) para numerar OP e rastreio MRP.';
COMMENT ON COLUMN public.sales_order_items.production_order_id IS 'OP gerada para esta linha de venda (uma OP por linha acabada).';

-- Preencher line_number sequencial por pedido (ordem de criação)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, sales_order_id
      ORDER BY created_at, id
    ) AS rn
  FROM public.sales_order_items
)
UPDATE public.sales_order_items s
SET line_number = r.rn
FROM ranked r
WHERE s.id = r.id;

ALTER TABLE public.sales_order_items
  ALTER COLUMN line_number SET NOT NULL,
  ALTER COLUMN line_number SET DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS sales_order_items_tenant_order_line_uq
  ON public.sales_order_items (tenant_id, sales_order_id, line_number);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_production_order
  ON public.sales_order_items (tenant_id, production_order_id)
  WHERE production_order_id IS NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sales_order_item_id UUID REFERENCES public.sales_order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_sales_order_item
  ON public.order_items (tenant_id, sales_order_item_id)
  WHERE sales_order_item_id IS NOT NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS trace_key TEXT;

COMMENT ON COLUMN public.purchase_order_items.trace_key IS 'Rastreio MRP: pedido-item-componente (ex.: PV01-2-MP001).';

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_trace_key
  ON public.purchase_order_items (tenant_id, trace_key)
  WHERE trace_key IS NOT NULL;
