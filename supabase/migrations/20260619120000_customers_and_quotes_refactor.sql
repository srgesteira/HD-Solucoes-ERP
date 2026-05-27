-- Clientes + campos profissionais em orçamentos

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_active ON public.customers(tenant_id, is_active);

DROP TRIGGER IF EXISTS trg_customers_updated ON public.customers;
CREATE TRIGGER trg_customers_updated
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select ON public.customers
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY customers_insert ON public.customers
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY customers_update ON public.customers
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY customers_delete ON public.customers
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

-- Orçamentos: cliente cadastrado + condições comerciais
ALTER TABLE public.quotes
  DROP COLUMN IF EXISTS client_document,
  DROP COLUMN IF EXISTS client_phone;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS validity_days INT NOT NULL DEFAULT 30;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS delivery_deadline TEXT;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS shipping_type TEXT NOT NULL DEFAULT 'FOB';

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_shipping_type_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_shipping_type_check
  CHECK (shipping_type IN ('FOB', 'CIF', 'Outro'));

CREATE INDEX IF NOT EXISTS idx_quotes_customer ON public.quotes(customer_id);

-- Garantir validity_days mínimo em registos antigos
UPDATE public.quotes
SET validity_days = GREATEST(COALESCE(validity_days, 30), 1)
WHERE validity_days IS NULL OR validity_days < 1;
