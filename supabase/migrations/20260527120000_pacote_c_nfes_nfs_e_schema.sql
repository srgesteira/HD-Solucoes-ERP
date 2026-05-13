-- Pacote C: NFS-e — tabela nfes alinhada ao modelo operacional (número, chave, URLs, estado).
-- Remove a versão anterior (reference/environment/last_response) em favor de campos simples.

DROP TRIGGER IF EXISTS trg_nfes_updated_at ON public.nfes;

DROP POLICY IF EXISTS nfes_select ON public.nfes;

DROP POLICY IF EXISTS nfes_insert ON public.nfes;

DROP POLICY IF EXISTS nfes_update ON public.nfes;

DROP POLICY IF EXISTS nfes_delete ON public.nfes;

DROP TABLE IF EXISTS public.nfes;

CREATE TABLE public.nfes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES public.sales_orders (id) ON DELETE SET NULL,
  nfe_number TEXT,
  nfe_key TEXT,
  xml_url TEXT,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN ('pending', 'processing', 'authorized', 'cancelled', 'error')
    ),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfes_tenant ON public.nfes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_nfes_sales_order ON public.nfes (sales_order_id);

CREATE TRIGGER trg_nfes_updated_at
  BEFORE UPDATE ON public.nfes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.nfes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nfes_select ON public.nfes FOR SELECT TO authenticated USING (
  tenant_id = public.get_current_tenant_id ()
);

CREATE POLICY nfes_insert ON public.nfes FOR INSERT TO authenticated WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY nfes_update ON public.nfes FOR UPDATE TO authenticated USING (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
)
WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

COMMENT ON TABLE public.nfes IS 'NFS-e emitida via FocusNFe (estado e URLs de documento)';

NOTIFY pgrst, 'reload schema';
