-- Permite NF-e de simples remessa na conferência fiscal.

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_invoice_document_type_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_invoice_document_type_check
  CHECK (
    invoice_document_type IS NULL
    OR invoice_document_type IN (
      'nfse',
      'nfe_product',
      'nfe_industrialization',
      'nfe_remessa'
    )
  );

COMMENT ON COLUMN public.sales_orders.invoice_document_type IS
  'Tipo de nota: nfse | nfe_product | nfe_industrialization | nfe_remessa. Obrigatório para emitir (excepto entrega sem nota).';
