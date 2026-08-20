-- Integração HD ERP ↔ Bling (NF-e de produto).
-- Aditivo: credenciais OAuth, vínculos de cadastro e colunas de emissão na
-- tabela nfes já existente. Tokens não têm policy para authenticated —
-- só o service_role (API server-side) lê/grava.

-- ---------------------------------------------------------------------
-- bling_credentials (1 linha por tenant)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bling_credentials (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ,
  webhook_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_bling_credentials_updated_at ON public.bling_credentials;
CREATE TRIGGER trg_bling_credentials_updated_at
  BEFORE UPDATE ON public.bling_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bling_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bling_credentials FROM anon, authenticated;
GRANT ALL ON public.bling_credentials TO service_role;

COMMENT ON TABLE public.bling_credentials IS
  'Tokens OAuth2 Bling v3 (segredo). Acesso só via service_role na API.';

-- Estado CSRF do authorization code (expira em minutos).
CREATE TABLE IF NOT EXISTS public.bling_oauth_states (
  state TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  created_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bling_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bling_oauth_states FROM anon, authenticated;
GRANT ALL ON public.bling_oauth_states TO service_role;

CREATE INDEX IF NOT EXISTS idx_bling_oauth_states_expires
  ON public.bling_oauth_states (expires_at);

-- ---------------------------------------------------------------------
-- Vínculos de cadastro (não são segredo)
-- ---------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bling_product_id BIGINT;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bling_contact_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_products_bling_product
  ON public.products (tenant_id, bling_product_id)
  WHERE bling_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_bling_contact
  ON public.customers (tenant_id, bling_contact_id)
  WHERE bling_contact_id IS NOT NULL;

COMMENT ON COLUMN public.products.bling_product_id IS
  'ID do produto no Bling. A configuração fiscal (NCM/CFOP/CSOSN) vive no Bling.';
COMMENT ON COLUMN public.customers.bling_contact_id IS
  'ID do contato no Bling, resolvido por CNPJ/CPF.';

-- ---------------------------------------------------------------------
-- nfes: colunas Bling + estados
-- ---------------------------------------------------------------------
ALTER TABLE public.nfes
  DROP CONSTRAINT IF EXISTS nfes_status_check;

ALTER TABLE public.nfes
  ADD CONSTRAINT nfes_status_check CHECK (
    status IN (
      'pending',
      'processing',
      'authorized',
      'rejected',
      'cancelled',
      'error'
    )
  );

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'focus';

ALTER TABLE public.nfes
  DROP CONSTRAINT IF EXISTS nfes_provider_check;

ALTER TABLE public.nfes
  ADD CONSTRAINT nfes_provider_check CHECK (provider IN ('focus', 'bling'));

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS bling_nfe_id BIGINT;

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS external_started_at TIMESTAMPTZ;

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS reconcile_needed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS customer_notified_at TIMESTAMPTZ;

ALTER TABLE public.nfes
  ADD COLUMN IF NOT EXISTS customer_notify_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nfes_tenant_idempotency
  ON public.nfes (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('pending', 'processing', 'authorized');

CREATE UNIQUE INDEX IF NOT EXISTS idx_nfes_bling_open_per_order
  ON public.nfes (tenant_id, sales_order_id)
  WHERE provider = 'bling'
    AND sales_order_id IS NOT NULL
    AND status IN ('pending', 'processing', 'authorized');

CREATE INDEX IF NOT EXISTS idx_nfes_bling_id
  ON public.nfes (tenant_id, bling_nfe_id)
  WHERE bling_nfe_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nfes_bling_reconcile
  ON public.nfes (tenant_id, status)
  WHERE provider = 'bling'
    AND (
      status IN ('pending', 'processing')
      OR reconcile_needed
    );

COMMENT ON COLUMN public.nfes.provider IS
  'focus = NFS-e FocusNFe; bling = NF-e modelo 55 via API Bling.';

-- ---------------------------------------------------------------------
-- RPC: gravar tokens (refresh rotativo — o Bling invalida o refresh antigo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bling_save_tokens(
  p_tenant_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_at TIMESTAMPTZ,
  p_scope TEXT,
  p_token_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'access_token vazio';
  END IF;
  IF p_refresh_token IS NULL OR length(trim(p_refresh_token)) = 0 THEN
    RAISE EXCEPTION 'refresh_token vazio';
  END IF;

  INSERT INTO public.bling_credentials (
    tenant_id,
    access_token,
    refresh_token,
    expires_at,
    scope,
    token_type,
    connected_at,
    refreshed_at
  )
  VALUES (
    p_tenant_id,
    p_access_token,
    p_refresh_token,
    p_expires_at,
    p_scope,
    COALESCE(NULLIF(trim(p_token_type), ''), 'Bearer'),
    NOW(),
    NOW()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    expires_at = EXCLUDED.expires_at,
    scope = EXCLUDED.scope,
    token_type = EXCLUDED.token_type,
    refreshed_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bling_save_tokens(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bling_save_tokens(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------
-- RPC: reclamar emissão Bling (idempotente por pedido em curso/autorizada)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bling_claim_nfe_emit(
  p_tenant_id UUID,
  p_sales_order_id UUID,
  p_idempotency_key TEXT
)
RETURNS public.nfes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.nfes%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(p_tenant_id::text || ':bling-nfe:' || p_sales_order_id::text)
  );

  SELECT *
    INTO v_row
    FROM public.nfes
   WHERE tenant_id = p_tenant_id
     AND sales_order_id = p_sales_order_id
     AND provider = 'bling'
     AND status IN ('pending', 'processing', 'authorized')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.nfes (
    tenant_id,
    sales_order_id,
    status,
    provider,
    idempotency_key
  )
  VALUES (
    p_tenant_id,
    p_sales_order_id,
    'pending',
    'bling',
    p_idempotency_key
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bling_claim_nfe_emit(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bling_claim_nfe_emit(UUID, UUID, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
