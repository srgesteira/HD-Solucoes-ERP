-- Motor fiscal configurável: regras como dados + trilha de auditoria.
-- REGRA DE FERRO: sem seed de alíquotas/CFOP — fiscal_rules nasce vazia por tenant.

-- ---------------------------------------------------------------------
-- 1. fiscal_rules — condições + resultados (resultados sempre nullable)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  notes TEXT,

  -- Condições (NULL = coringa)
  operation_type TEXT CHECK (
    operation_type IS NULL
    OR operation_type IN ('sale', 'purchase')
  ),
  origin_uf CHAR(2) CHECK (
    origin_uf IS NULL
    OR origin_uf ~ '^[A-Z]{2}$'
  ),
  destination_uf CHAR(2) CHECK (
    destination_uf IS NULL
    OR destination_uf ~ '^[A-Z]{2}$'
  ),
  tax_regime_id UUID REFERENCES public.tax_regimes (id) ON DELETE SET NULL,
  company_tax_regime TEXT CHECK (
    company_tax_regime IS NULL
    OR company_tax_regime IN (
      'simples_nacional',
      'lucro_presumido',
      'lucro_real'
    )
  ),
  ncm_pattern TEXT,
  product_prefix_code TEXT,
  product_nature TEXT,

  -- Resultados (nullable — preenchidos pela contadora)
  cfop TEXT,
  icms_rate DECIMAL(5, 2) CHECK (
    icms_rate IS NULL
    OR (icms_rate >= 0 AND icms_rate <= 100)
  ),
  icms_st BOOLEAN,
  icms_st_rate DECIMAL(5, 2) CHECK (
    icms_st_rate IS NULL
    OR (icms_st_rate >= 0 AND icms_st_rate <= 100)
  ),
  ipi_rate DECIMAL(5, 2) CHECK (
    ipi_rate IS NULL
    OR (ipi_rate >= 0 AND ipi_rate <= 100)
  ),
  pis_rate DECIMAL(5, 2) CHECK (
    pis_rate IS NULL
    OR (pis_rate >= 0 AND pis_rate <= 100)
  ),
  cofins_rate DECIMAL(5, 2) CHECK (
    cofins_rate IS NULL
    OR (cofins_rate >= 0 AND cofins_rate <= 100)
  ),
  cbs_rate DECIMAL(5, 2) CHECK (
    cbs_rate IS NULL
    OR (cbs_rate >= 0 AND cbs_rate <= 100)
  ),
  ibs_rate DECIMAL(5, 2) CHECK (
    ibs_rate IS NULL
    OR (ibs_rate >= 0 AND ibs_rate <= 100)
  ),
  ibs_cbs_classificacao TEXT,

  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fiscal_rules_tenant_name_uidx UNIQUE (tenant_id, name)
);

CREATE OR REPLACE FUNCTION public.fiscal_rules_enforce_tax_regime_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  regime_tenant UUID;
BEGIN
  IF NEW.tax_regime_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tr.tenant_id INTO regime_tenant
  FROM public.tax_regimes tr
  WHERE tr.id = NEW.tax_regime_id;

  IF regime_tenant IS NULL THEN
    RAISE EXCEPTION 'tax_regime_not_found';
  END IF;

  IF regime_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'tax_regime_tenant_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_rules_enforce_tax_regime_tenant ON public.fiscal_rules;
CREATE TRIGGER trg_fiscal_rules_enforce_tax_regime_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, tax_regime_id
  ON public.fiscal_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.fiscal_rules_enforce_tax_regime_tenant();

CREATE INDEX IF NOT EXISTS idx_fiscal_rules_tenant_active
  ON public.fiscal_rules (tenant_id, is_active, priority)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fiscal_rules_tenant_operation
  ON public.fiscal_rules (tenant_id, operation_type);

COMMENT ON TABLE public.fiscal_rules IS
  'Regras fiscais configuráveis por tenant. Resultados nullable até cadastro pela contadora.';
COMMENT ON COLUMN public.fiscal_rules.operation_type IS
  'sale | purchase — NULL significa qualquer operação.';
COMMENT ON COLUMN public.fiscal_rules.ncm_pattern IS
  'NCM exato ou prefixo com % (ex.: 8421%).';
COMMENT ON COLUMN public.fiscal_rules.priority IS
  'Menor valor = maior precedência em empate de especificidade.';

DROP TRIGGER IF EXISTS set_fiscal_rules_updated_at ON public.fiscal_rules;
CREATE TRIGGER set_fiscal_rules_updated_at
  BEFORE UPDATE ON public.fiscal_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. fiscal_rule_applications — auditoria por linha de pedido
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_rule_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  document_type TEXT NOT NULL CHECK (
    document_type IN ('sales_order_item', 'purchase_order_item')
  ),
  document_line_id UUID NOT NULL,
  fiscal_rule_id UUID REFERENCES public.fiscal_rules (id) ON DELETE SET NULL,

  match_score INT NOT NULL DEFAULT 0,
  match_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  source TEXT NOT NULL DEFAULT 'auto' CHECK (
    source IN ('auto', 'manual_override', 'recalc', 'preview')
  ),

  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fiscal_rule_applications_tenant_line
  ON public.fiscal_rule_applications (tenant_id, document_type, document_line_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_rule_applications_tenant_rule
  ON public.fiscal_rule_applications (tenant_id, fiscal_rule_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_rule_applications_applied_at
  ON public.fiscal_rule_applications (tenant_id, applied_at DESC);

COMMENT ON TABLE public.fiscal_rule_applications IS
  'Trilha auditável: qual regra fiscal foi considerada/aplicada em cada linha de pedido.';
COMMENT ON COLUMN public.fiscal_rule_applications.fiscal_rule_id IS
  'NULL quando nenhuma regra casou (score=0).';
COMMENT ON COLUMN public.fiscal_rule_applications.match_detail IS
  'Critérios que casaram e motivo da escolha (especificidade/priority).';

-- ---------------------------------------------------------------------
-- 3. fiscal_status em sales_orders e purchase_orders
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_orders'
      AND column_name = 'fiscal_status'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD COLUMN fiscal_status TEXT NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_orders'
      AND column_name = 'fiscal_status'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN fiscal_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Remove CHECK legado (ex.: só pending/ready_to_invoice) antes de normalizar valores.
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_fiscal_status_check;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_fiscal_status_check;

-- Normaliza valores legados/drift (ex.: ready_to_invoice na coluna fantasma).
UPDATE public.sales_orders
SET fiscal_status = 'no_rules'
WHERE fiscal_status IS NULL
   OR fiscal_status NOT IN (
     'pending',
     'no_rules',
     'rules_applied',
     'manual_override',
     'review_required',
     'approved'
   );

UPDATE public.purchase_orders
SET fiscal_status = 'no_rules'
WHERE fiscal_status IS NULL
   OR fiscal_status NOT IN (
     'pending',
     'no_rules',
     'rules_applied',
     'manual_override',
     'review_required',
     'approved'
   );

-- Garante constraint com enum definitivo.
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_fiscal_status_check CHECK (
    fiscal_status IN (
      'pending',
      'no_rules',
      'rules_applied',
      'manual_override',
      'review_required',
      'approved'
    )
  );

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_fiscal_status_check CHECK (
    fiscal_status IN (
      'pending',
      'no_rules',
      'rules_applied',
      'manual_override',
      'review_required',
      'approved'
    )
  );

ALTER TABLE public.sales_orders
  ALTER COLUMN fiscal_status SET DEFAULT 'pending';

ALTER TABLE public.purchase_orders
  ALTER COLUMN fiscal_status SET DEFAULT 'pending';

-- Pedidos existentes: sem motor ativo até agora → no_rules (comportamento manual preservado).
UPDATE public.sales_orders
SET fiscal_status = 'no_rules'
WHERE fiscal_status = 'pending';

UPDATE public.purchase_orders
SET fiscal_status = 'no_rules'
WHERE fiscal_status = 'pending';

COMMENT ON COLUMN public.sales_orders.fiscal_status IS
  'pending | no_rules | rules_applied | manual_override | review_required | approved';
COMMENT ON COLUMN public.purchase_orders.fiscal_status IS
  'pending | no_rules | rules_applied | manual_override | review_required | approved';

CREATE INDEX IF NOT EXISTS idx_sales_orders_fiscal_status
  ON public.sales_orders (tenant_id, fiscal_status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_fiscal_status
  ON public.purchase_orders (tenant_id, fiscal_status);

-- ---------------------------------------------------------------------
-- 4. RLS (padrão tax_regimes)
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_rule_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_rules_select" ON public.fiscal_rules;
CREATE POLICY "fiscal_rules_select"
  ON public.fiscal_rules
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "fiscal_rules_admin" ON public.fiscal_rules;
CREATE POLICY "fiscal_rules_admin"
  ON public.fiscal_rules
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

DROP POLICY IF EXISTS "fiscal_rule_applications_select" ON public.fiscal_rule_applications;
CREATE POLICY "fiscal_rule_applications_select"
  ON public.fiscal_rule_applications
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "fiscal_rule_applications_insert" ON public.fiscal_rule_applications;
CREATE POLICY "fiscal_rule_applications_insert"
  ON public.fiscal_rule_applications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
