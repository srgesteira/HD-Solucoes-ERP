-- =====================================================================
-- Módulo PCP (produção) — linhas, feriados, pedidos e itens
-- Baseado no PCP Control legado; multi-tenant alinhado ao ERP atual.
-- =====================================================================

-- 1. Linhas de produção
CREATE TABLE IF NOT EXISTS public.production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_lines_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_production_lines_tenant ON public.production_lines(tenant_id);

-- 2. Feriados
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holidays_tenant_date_unique UNIQUE (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_tenant ON public.holidays(tenant_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);

-- 3. Pedidos de produção (equivalente a orders do legado)
CREATE TABLE IF NOT EXISTS public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  client_name TEXT,
  client_document TEXT,
  description TEXT,
  delivery_deadline DATE,
  pcp_deadline DATE,
  production_deadline DATE,
  status TEXT NOT NULL DEFAULT 'imported'
    CHECK (
      status IN (
        'imported',
        'planning',
        'in_production',
        'ready',
        'finished',
        'delayed',
        'cancelled'
      )
    ),
  pdf_path TEXT,
  folder_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_orders_tenant_order_number UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_production_orders_tenant ON public.production_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON public.production_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_production_orders_order_number ON public.production_orders(tenant_id, order_number);

-- 4. Itens do pedido
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  item_number INTEGER,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'UN',
  line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
  pcp_deadline DATE,
  production_start DATE,
  production_end DATE,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'scheduled', 'completed', 'delayed')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  estimated_hours NUMERIC(8, 2),
  actual_hours NUMERIC(8, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON public.order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_line ON public.order_items(line_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON public.order_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_dates ON public.order_items(production_start, production_end);

-- 5. Operadores por linha
CREATE TABLE IF NOT EXISTS public.operator_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operator_lines_unique_membership UNIQUE (tenant_id, user_profile_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_lines_line ON public.operator_lines(line_id);
CREATE INDEX IF NOT EXISTS idx_operator_lines_user ON public.operator_lines(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_operator_lines_tenant ON public.operator_lines(tenant_id);

-- ---------------------------------------------------------------------
-- Garantir tenant_id coerente (RLS por tenant_id direto nos itens)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_sync_tenant_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT po.tenant_id INTO STRICT NEW.tenant_id
  FROM public.production_orders AS po
  WHERE po.id = NEW.order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_sync_tenant ON public.order_items;
CREATE TRIGGER trg_order_items_sync_tenant
  BEFORE INSERT OR UPDATE OF order_id ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.order_items_sync_tenant_from_order();

CREATE OR REPLACE FUNCTION public.operator_lines_sync_tenant_from_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT pl.tenant_id INTO STRICT NEW.tenant_id
  FROM public.production_lines AS pl
  WHERE pl.id = NEW.line_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_lines_sync_tenant ON public.operator_lines;
CREATE TRIGGER trg_operator_lines_sync_tenant
  BEFORE INSERT OR UPDATE OF line_id ON public.operator_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.operator_lines_sync_tenant_from_line();

-- ---------------------------------------------------------------------
-- Trigger: MAX(production_end) nos itens → production_orders.production_deadline
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_production_deadline_from_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.production_orders AS po
  SET production_deadline = (
      SELECT MAX(oi.production_end)
      FROM public.order_items AS oi
      WHERE oi.order_id = COALESCE(NEW.order_id, OLD.order_id)
        AND oi.production_end IS NOT NULL
    ),
    updated_at = NOW()
  WHERE po.id = COALESCE(NEW.order_id, OLD.order_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_refresh_production_deadline ON public.order_items;
CREATE TRIGGER trg_order_items_refresh_production_deadline
  AFTER INSERT OR UPDATE OF production_end OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_production_deadline_from_items();

-- ---------------------------------------------------------------------
-- updated_at (função já existe no Módulo 1)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_production_lines_updated ON public.production_lines;
CREATE TRIGGER trg_production_lines_updated
  BEFORE UPDATE ON public.production_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_production_orders_updated ON public.production_orders;
CREATE TRIGGER trg_production_orders_updated
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_order_items_updated ON public.order_items;
CREATE TRIGGER trg_order_items_updated
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_lines_select ON public.production_lines
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY production_lines_insert ON public.production_lines
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY production_lines_update ON public.production_lines
  FOR UPDATE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY production_lines_delete ON public.production_lines
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY holidays_select ON public.holidays
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY holidays_insert ON public.holidays
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY holidays_update ON public.holidays
  FOR UPDATE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY holidays_delete ON public.holidays
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY production_orders_select ON public.production_orders
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY production_orders_insert ON public.production_orders
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY production_orders_update ON public.production_orders
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY production_orders_delete ON public.production_orders
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY order_items_select ON public.order_items
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY order_items_insert ON public.order_items
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY order_items_update ON public.order_items
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY order_items_delete ON public.order_items
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY operator_lines_select ON public.operator_lines
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY operator_lines_insert ON public.operator_lines
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY operator_lines_update ON public.operator_lines
  FOR UPDATE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY operator_lines_delete ON public.operator_lines
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );
