-- =====================================================================
-- Módulo Vendas e Financeiro — orçamentos, pedidos, itens, recebíveis, metas
-- Multi-tenant (tenant_id), RLS alinhado ao restante do ERP
-- =====================================================================

-- 1. Orçamentos (converted_to_sale_id: FK adicionada após sales_orders)
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_document TEXT,
  client_email TEXT,
  client_phone TEXT,
  quote_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'sent',
        'approved',
        'rejected',
        'converted'
      )
    ),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  bdi_percentage NUMERIC(5, 2),
  bdi_value NUMERIC(12, 2),
  base_cost NUMERIC(12, 2),
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  converted_to_sale_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotes_tenant_number_unique UNIQUE (tenant_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON public.quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(tenant_id, status);

CREATE OR REPLACE FUNCTION public.quotes_recalc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total := ROUND(
    COALESCE(NEW.subtotal, 0) - COALESCE(NEW.discount, 0) + COALESCE(NEW.tax, 0),
    2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_recalc_total ON public.quotes;
CREATE TRIGGER trg_quotes_recalc_total
  BEFORE INSERT OR UPDATE OF subtotal, discount, tax ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.quotes_recalc_total();

-- 2. Pedidos de venda
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_document TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  order_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  expected_delivery DATE,
  actual_delivery DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'confirmed',
        'in_production',
        'shipped',
        'delivered',
        'cancelled'
      )
    ),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  production_order_id UUID REFERENCES public.production_orders(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_orders_tenant_number_unique UNIQUE (tenant_id, order_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS t ON t.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    WHERE c.conname = 'quotes_converted_to_sale_fk'
      AND n.nspname = 'public'
      AND t.relname = 'quotes'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_converted_to_sale_fk FOREIGN KEY (converted_to_sale_id)
        REFERENCES public.sales_orders(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant ON public.sales_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON public.sales_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_quote ON public.sales_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_production
  ON public.sales_orders(production_order_id);

-- 3. Itens do pedido de venda
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'UN',
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 4),
  total_cost NUMERIC(12, 4),
  profit NUMERIC(12, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_tenant ON public.sales_order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order
  ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_product
  ON public.sales_order_items(product_id);

CREATE OR REPLACE FUNCTION public.sales_order_items_sync_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT so.tenant_id INTO STRICT NEW.tenant_id
  FROM public.sales_orders AS so
  WHERE so.id = NEW.sales_order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_order_items_a_sync_tenant ON public.sales_order_items;
CREATE TRIGGER trg_sales_order_items_a_sync_tenant
  BEFORE INSERT OR UPDATE OF sales_order_id ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_order_items_sync_tenant();

CREATE OR REPLACE FUNCTION public.sales_order_items_line_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total_price := ROUND(
    COALESCE(NEW.quantity, 0)::NUMERIC * COALESCE(NEW.unit_price, 0)::NUMERIC,
    4
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_order_items_b_line_total ON public.sales_order_items;
CREATE TRIGGER trg_sales_order_items_b_line_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_order_items_line_total();

CREATE OR REPLACE FUNCTION public.sales_order_items_derive_cost_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_cost IS NULL THEN
    NEW.total_cost := NULL;
    NEW.profit := NULL;
  ELSE
    NEW.total_cost := ROUND(
      COALESCE(NEW.quantity, 0)::NUMERIC * COALESCE(NEW.unit_cost, 0)::NUMERIC,
      4
    );
    NEW.profit :=
      ROUND(COALESCE(NEW.total_price, 0)::NUMERIC - COALESCE(NEW.total_cost, 0)::NUMERIC, 4);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_order_items_c_derive_cost_profit ON public.sales_order_items;
CREATE TRIGGER trg_sales_order_items_c_derive_cost_profit
  BEFORE INSERT OR UPDATE OF quantity, unit_price, unit_cost
    ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_order_items_derive_cost_profit();

CREATE OR REPLACE FUNCTION public.sales_orders_recalc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total := ROUND(
    COALESCE(NEW.subtotal, 0) - COALESCE(NEW.discount, 0) + COALESCE(NEW.tax, 0),
    2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_orders_recalc_total ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_recalc_total
  BEFORE INSERT OR UPDATE OF subtotal, discount, tax ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_orders_recalc_total();

CREATE OR REPLACE FUNCTION public.refresh_sales_order_subtotal(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  st NUMERIC(12, 2);
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT ROUND(
    COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0)::NUMERIC,
    2
  )
  INTO st
  FROM public.sales_order_items
  WHERE sales_order_id = p_order_id;

  UPDATE public.sales_orders
  SET subtotal = st,
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_sales_order_items_refresh_header()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.refresh_sales_order_subtotal(OLD.sales_order_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_sales_order_subtotal(NEW.sales_order_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id THEN
      PERFORM public.refresh_sales_order_subtotal(NEW.sales_order_id);
    ELSE
      PERFORM public.refresh_sales_order_subtotal(NEW.sales_order_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_order_items_refresh_header ON public.sales_order_items;
CREATE TRIGGER trg_sales_order_items_refresh_header
  AFTER INSERT OR DELETE OR UPDATE OF quantity, unit_price, sales_order_id
    ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_sales_order_items_refresh_header();

-- ---------------------------------------------------------------------
-- Contas a receber
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  document_number TEXT,
  description TEXT,
  original_amount NUMERIC(12, 2) NOT NULL,
  current_amount NUMERIC(12, 2) NOT NULL,
  issue_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'partial',
        'paid',
        'overdue',
        'cancelled'
      )
    ),
  interest_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  client_name TEXT,
  client_document TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receivables_tenant ON public.receivables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON public.receivables(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_receivables_due_date ON public.receivables(due_date);
CREATE INDEX IF NOT EXISTS idx_receivables_sales_order ON public.receivables(sales_order_id);

-- ---------------------------------------------------------------------
-- Metas de vendas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year SMALLINT NOT NULL,
  month SMALLINT NOT NULL,
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  goal_amount NUMERIC(12, 2) NOT NULL,
  achieved_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_goals_month_check CHECK (
    month >= 1 AND month <= 12
  ),
  CONSTRAINT sales_goals_tenant_period_user_unique UNIQUE (
    tenant_id,
    year,
    month,
    user_profile_id
  )
);

CREATE INDEX IF NOT EXISTS idx_sales_goals_tenant ON public.sales_goals(tenant_id);

-- ---------------------------------------------------------------------
-- BDI — evita denominador ≤ 0
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_bdi(
  base_cost NUMERIC,
  tax_rate NUMERIC,
  admin_overhead NUMERIC,
  profit_margin NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  denom NUMERIC;
BEGIN
  denom := 1
    - (
      COALESCE(tax_rate, 0)::NUMERIC
      + COALESCE(admin_overhead, 0)::NUMERIC
      + COALESCE(profit_margin, 0)::NUMERIC
    );
  IF denom <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN ROUND(COALESCE(base_cost, 0)::NUMERIC / denom, 4);
END;
$$;

-- ---------------------------------------------------------------------
-- updated_at (função existente no projeto)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_quotes_updated ON public.quotes;
CREATE TRIGGER trg_quotes_updated
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_orders_updated ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_updated
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_order_items_updated ON public.sales_order_items;
CREATE TRIGGER trg_sales_order_items_updated
  BEFORE UPDATE ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_receivables_updated ON public.receivables;
CREATE TRIGGER trg_receivables_updated
  BEFORE UPDATE ON public.receivables
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_goals_updated ON public.sales_goals;
CREATE TRIGGER trg_sales_goals_updated
  BEFORE UPDATE ON public.sales_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_select ON public.quotes
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY quotes_delete ON public.quotes
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY sales_orders_select ON public.sales_orders
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_orders_insert ON public.sales_orders
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_orders_update ON public.sales_orders
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_orders_delete ON public.sales_orders
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY sales_order_items_select ON public.sales_order_items
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_order_items_insert ON public.sales_order_items
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_order_items_update ON public.sales_order_items
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_order_items_delete ON public.sales_order_items
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY receivables_select ON public.receivables
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY receivables_insert ON public.receivables
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY receivables_update ON public.receivables
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY receivables_delete ON public.receivables
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY sales_goals_select ON public.sales_goals
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_goals_insert ON public.sales_goals
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_goals_update ON public.sales_goals
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY sales_goals_delete ON public.sales_goals
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

NOTIFY pgrst, 'reload schema';
