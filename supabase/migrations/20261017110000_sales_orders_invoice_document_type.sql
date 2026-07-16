-- Tipo de documento fiscal gravado na conferência (Expedição emite sem perguntar).

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS invoice_document_type TEXT;

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_invoice_document_type_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_invoice_document_type_check
  CHECK (
    invoice_document_type IS NULL
    OR invoice_document_type IN ('nfse', 'nfe_product', 'nfe_industrialization')
  );

COMMENT ON COLUMN public.sales_orders.invoice_document_type IS
  'Tipo de nota: nfse | nfe_product | nfe_industrialization. Obrigatório para emitir (excepto entrega sem nota).';

CREATE INDEX IF NOT EXISTS idx_sales_orders_invoice_document_type
  ON public.sales_orders (tenant_id, invoice_document_type)
  WHERE invoice_document_type IS NOT NULL;
