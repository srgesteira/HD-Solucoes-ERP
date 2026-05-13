-- Pacote C: estoque básico, NF-e (FocusNFe), MRP (fornecedor preferencial em products)

-- ---------------------------------------------------------------------
-- Estoque por produto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(12, 4) NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(12, 4) DEFAULT 0,
  reorder_quantity NUMERIC(12, 4) DEFAULT 0,
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_tenant_product_unique UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON public.inventory (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON public.inventory (product_id);

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON public.inventory;

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_select ON public.inventory;

DROP POLICY IF EXISTS inventory_insert ON public.inventory;

DROP POLICY IF EXISTS inventory_update ON public.inventory;

DROP POLICY IF EXISTS inventory_delete ON public.inventory;

CREATE POLICY inventory_select ON public.inventory FOR SELECT TO authenticated USING (
  tenant_id = public.get_current_tenant_id ()
);

CREATE POLICY inventory_insert ON public.inventory FOR INSERT TO authenticated WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY inventory_update ON public.inventory FOR UPDATE TO authenticated USING (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
)
WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

COMMENT ON TABLE public.inventory IS 'Estoque básico por produto (tenant)';

-- ---------------------------------------------------------------------
-- FocusNFe em company_settings
-- ---------------------------------------------------------------------
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS focusnfe_token TEXT;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS focusnfe_environment TEXT DEFAULT 'homologacao';

UPDATE public.company_settings
SET
  focusnfe_environment = 'homologacao'
WHERE
  focusnfe_environment IS NULL
  OR focusnfe_environment NOT IN ('homologacao', 'producao');

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_focusnfe_environment_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_focusnfe_environment_check CHECK (
    focusnfe_environment IN ('homologacao', 'producao')
  );

-- ---------------------------------------------------------------------
-- Fornecedor preferencial (MRP / compras sugeridas)
-- ---------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID REFERENCES public.suppliers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_preferred_supplier
  ON public.products (preferred_supplier_id)
  WHERE preferred_supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- NF-e emitidas (referência Focus + estado)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nfes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES public.sales_orders (id) ON DELETE SET NULL,
  reference TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'homologacao',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'processing',
        'authorized',
        'rejected',
        'cancelled',
        'error'
      )
    ),
  chave_acesso TEXT,
  numero INT,
  serie INT,
  protocolo TEXT,
  motivo_status TEXT,
  last_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nfes_tenant_reference_unique UNIQUE (tenant_id, reference),
  CONSTRAINT nfes_environment_check CHECK (environment IN ('homologacao', 'producao'))
);

CREATE INDEX IF NOT EXISTS idx_nfes_tenant ON public.nfes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nfes_sales_order ON public.nfes (sales_order_id);

DROP TRIGGER IF EXISTS trg_nfes_updated_at ON public.nfes;

CREATE TRIGGER trg_nfes_updated_at
  BEFORE UPDATE ON public.nfes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.nfes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfes_select ON public.nfes;

DROP POLICY IF EXISTS nfes_insert ON public.nfes;

DROP POLICY IF EXISTS nfes_update ON public.nfes;

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

COMMENT ON TABLE public.nfes IS 'Registos de emissão NF-e via FocusNFe (referência + resposta)';

NOTIFY pgrst, 'reload schema';
