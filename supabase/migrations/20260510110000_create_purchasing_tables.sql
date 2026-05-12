-- =====================================================================
-- Módulo Compras — fornecedores, pedidos, itens, receções
-- Multi-tenant (tenant_id), RLS alinhado ao restante do ERP
-- =====================================================================

-- 1. Fornecedores
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  document TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  contact_person TEXT,
  payment_terms TEXT,
  delivery_terms TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suppliers_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_document ON public.suppliers(tenant_id, document);

-- 2. Pedidos de compra
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  expected_delivery DATE,
  actual_delivery DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'sent',
        'confirmed',
        'partial',
        'received',
        'cancelled'
      )
    ),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  requested_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_orders_tenant_po_unique UNIQUE (tenant_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON public.purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_number
  ON public.purchase_orders(tenant_id, po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status
  ON public.purchase_orders(tenant_id, status);

-- 3. Itens do pedido de compra
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'UN',
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0,
  production_order_id UUID REFERENCES public.production_orders(id) ON DELETE SET NULL,
  production_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tenant ON public.purchase_order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product ON public.purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_production_order
  ON public.purchase_order_items(production_order_id);

-- 4. Recebimentos (entradas parciais)
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  items JSONB,
  notes TEXT,
  received_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT goods_receipts_tenant_receipt_unique UNIQUE (tenant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_tenant ON public.goods_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_order ON public.goods_receipts(purchase_order_id);

-- ---------------------------------------------------------------------
-- tenant_id coerente nos itens e receções
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_items_sync_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT po.tenant_id INTO STRICT NEW.tenant_id
  FROM public.purchase_orders AS po
  WHERE po.id = NEW.purchase_order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_sync_tenant ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_sync_tenant
  BEFORE INSERT OR UPDATE OF purchase_order_id ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_items_sync_tenant();

CREATE OR REPLACE FUNCTION public.goods_receipts_sync_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT po.tenant_id INTO STRICT NEW.tenant_id
  FROM public.purchase_orders AS po
  WHERE po.id = NEW.purchase_order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_goods_receipts_sync_tenant ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipts_sync_tenant
  BEFORE INSERT OR UPDATE OF purchase_order_id ON public.goods_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.goods_receipts_sync_tenant();

-- ---------------------------------------------------------------------
-- Linha: total_price = qty * unit_price
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_items_line_total()
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

DROP TRIGGER IF EXISTS trg_purchase_order_items_line_total ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_line_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_items_line_total();

-- ---------------------------------------------------------------------
-- Cabeçalho: total = subtotal - discount + tax
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_orders_recalc_total()
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

DROP TRIGGER IF EXISTS trg_purchase_orders_recalc_total ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_recalc_total
  BEFORE INSERT OR UPDATE OF subtotal, discount, tax ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_orders_recalc_total();

-- ---------------------------------------------------------------------
-- Atualizar subtotal do pedido quando os itens mudam
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_purchase_order_subtotal(p_po_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  st NUMERIC(12, 2);
BEGIN
  IF p_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT ROUND(
    COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0)::NUMERIC,
    2
  )
  INTO st
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_po_id;

  UPDATE public.purchase_orders
  SET subtotal = st,
      updated_at = NOW()
  WHERE id = p_po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_purchase_order_items_refresh_header()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.refresh_purchase_order_subtotal(OLD.purchase_order_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_purchase_order_subtotal(NEW.purchase_order_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
      PERFORM public.refresh_purchase_order_subtotal(NEW.purchase_order_id);
    ELSE
      PERFORM public.refresh_purchase_order_subtotal(NEW.purchase_order_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_refresh_header ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_refresh_header
  AFTER INSERT OR DELETE OR UPDATE OF quantity, unit_price, purchase_order_id
    ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_purchase_order_items_refresh_header();

-- ---------------------------------------------------------------------
-- updated_at (função existente no Módulo 1)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_suppliers_updated ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_orders_updated ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_order_items_updated ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_updated
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY suppliers_insert ON public.suppliers
  FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY suppliers_update ON public.suppliers
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY suppliers_delete ON public.suppliers
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY purchase_orders_select ON public.purchase_orders
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY purchase_orders_insert ON public.purchase_orders
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY purchase_orders_update ON public.purchase_orders
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY purchase_orders_delete ON public.purchase_orders
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY purchase_order_items_select ON public.purchase_order_items
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY purchase_order_items_insert ON public.purchase_order_items
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY purchase_order_items_update ON public.purchase_order_items
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY purchase_order_items_delete ON public.purchase_order_items
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY goods_receipts_select ON public.goods_receipts
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY goods_receipts_insert ON public.goods_receipts
  FOR INSERT WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY goods_receipts_update ON public.goods_receipts
  FOR UPDATE USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY goods_receipts_delete ON public.goods_receipts
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );
