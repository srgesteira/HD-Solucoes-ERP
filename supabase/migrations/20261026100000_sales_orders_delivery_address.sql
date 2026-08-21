-- Endereço de entrega distinto do faturamento (cadastro do cliente).
-- client_address continua a ser o endereço fiscal/faturamento (texto copiado do cliente).

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS delivery_address_different BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_street TEXT,
  ADD COLUMN IF NOT EXISTS delivery_number TEXT,
  ADD COLUMN IF NOT EXISTS delivery_complement TEXT,
  ADD COLUMN IF NOT EXISTS delivery_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS delivery_city TEXT,
  ADD COLUMN IF NOT EXISTS delivery_state TEXT,
  ADD COLUMN IF NOT EXISTS delivery_zip TEXT;

COMMENT ON COLUMN public.sales_orders.delivery_address_different IS
  'True quando a mercadoria vai para endereço diferente do faturamento (cliente).';
COMMENT ON COLUMN public.sales_orders.delivery_street IS
  'Logradouro de entrega (só se delivery_address_different).';
COMMENT ON COLUMN public.sales_orders.delivery_state IS
  'UF de entrega (2 letras).';
COMMENT ON COLUMN public.sales_orders.delivery_zip IS
  'CEP de entrega (apenas dígitos).';
