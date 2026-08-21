-- Espelho comercial do pedido Bling (frete / quem paga / transportadora).
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS shipping_type TEXT,
  ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS freight_payer TEXT;

COMMENT ON COLUMN public.sales_orders.shipping_type IS
  'CIF/FOB espelhado com o pedido Bling (transporte.fretePorConta).';
COMMENT ON COLUMN public.sales_orders.freight_cost IS
  'Valor do frete espelhado com o pedido Bling (transporte.frete).';
COMMENT ON COLUMN public.sales_orders.carrier_name IS
  'Nome da transportadora no pedido Bling (transporte.contato.nome).';
COMMENT ON COLUMN public.sales_orders.freight_payer IS
  'Quem paga o frete: remetente, destinatario ou terceiros.';

UPDATE public.sales_orders so
SET
  shipping_type = COALESCE(so.shipping_type, q.shipping_type),
  freight_cost = CASE
    WHEN so.freight_cost IS NULL OR so.freight_cost = 0 THEN COALESCE(q.freight_cost, 0)
    ELSE so.freight_cost
  END
FROM public.quotes q
WHERE so.quote_id = q.id
  AND (so.shipping_type IS NULL OR so.freight_cost IS NULL OR so.freight_cost = 0);
