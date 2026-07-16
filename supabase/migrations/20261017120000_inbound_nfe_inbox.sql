-- Inbox de NF-e recebidas (Focus MDe / nfes_recebidas) para conciliar com PC.

CREATE TABLE IF NOT EXISTS public.inbound_nfe_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  access_key text NOT NULL,
  issuer_name text,
  issuer_document text,
  issue_date date,
  total_amount numeric(14, 2),
  xml_content text,
  json_payload jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'linked', 'ignored')),
  purchase_order_id uuid REFERENCES public.purchase_orders (id) ON DELETE SET NULL,
  focus_version bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, access_key)
);

CREATE INDEX IF NOT EXISTS idx_inbound_nfe_inbox_tenant_status
  ON public.inbound_nfe_inbox (tenant_id, status, issue_date DESC);

COMMENT ON TABLE public.inbound_nfe_inbox IS
  'NF-e emitidas contra o CNPJ (Focus nfes_recebidas / MDe), prontas para conciliar com PC.';
