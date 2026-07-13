-- Solicitações de orçamento de compra (RFQ) — documento numerado como PC
CREATE TABLE IF NOT EXISTS public.purchase_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  request_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  need_date DATE,
  notes TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'cancelled')),
  requested_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_quote_requests_tenant_number_unique
    UNIQUE (tenant_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_quote_requests_tenant
  ON public.purchase_quote_requests (tenant_id);

CREATE INDEX IF NOT EXISTS idx_purchase_quote_requests_tenant_date
  ON public.purchase_quote_requests (tenant_id, request_date DESC);

COMMENT ON TABLE public.purchase_quote_requests IS
  'Solicitação de orçamento (RFQ) de compras — cabeçalho numerado, sem fornecedor fixo.';

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_quote_request_id UUID
    REFERENCES public.purchase_quote_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_quote_request
  ON public.purchase_order_items (purchase_quote_request_id)
  WHERE purchase_quote_request_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_order_items.purchase_quote_request_id IS
  'Ligação à solicitação de orçamento (RFQ), quando o item nasceu desse documento.';

ALTER TABLE public.purchase_quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_quote_requests_tenant_all ON public.purchase_quote_requests;
CREATE POLICY purchase_quote_requests_tenant_all
  ON public.purchase_quote_requests
  FOR ALL
  USING (
    tenant_id = (
      SELECT up.tenant_id
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = (
      SELECT up.tenant_id
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
    )
  );
