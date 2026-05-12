-- =====================================================================
-- Produtos (SKU), BOM (lista de materiais / componentes) e centros de trabalho (chão de fábrica).
-- =====================================================================

-- JWT padrão do Supabase não expõe auth.tenant_id(); usamos o tenant do perfil.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.tenant_id
  FROM public.user_profiles AS up
  WHERE up.id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_current_tenant_id() IS
  'Tenant do utilizador autenticado (user_profiles); para RLS multi-tenant.';

CREATE OR REPLACE FUNCTION public.is_current_user_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles AS up
    WHERE up.id = auth.uid()
      AND up.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_current_user_tenant_admin() IS
  'True se o utilizador atual é admin do seu tenant (um perfil por utilizador).';

-- ---------------------------------------------------------------------
-- work_centers (antes de product_components — FK opcional em BOM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hourly_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  efficiency NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT work_centers_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_work_centers_tenant
  ON public.work_centers(tenant_id) WHERE is_active;

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  technical_description TEXT,
  ncm TEXT,
  unit TEXT,
  type TEXT NOT NULL DEFAULT 'finished' CHECK (type IN ('finished', 'raw', 'component')),
  cost_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant
  ON public.products(tenant_id) WHERE is_active;

-- ---------------------------------------------------------------------
-- product_components (BOM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC(18, 6) NOT NULL,
  unit_cost NUMERIC(14, 4),
  is_labor BOOLEAN NOT NULL DEFAULT FALSE,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_components_parent
  ON public.product_components(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_product_components_component
  ON public.product_components(component_product_id);
CREATE INDEX IF NOT EXISTS idx_product_components_tenant
  ON public.product_components(tenant_id);

-- ---------------------------------------------------------------------
-- updated_at (reutiliza public.set_updated_at do Módulo 1)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_work_centers_updated ON public.work_centers;
CREATE TRIGGER trg_work_centers_updated
  BEFORE UPDATE ON public.work_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_product_components_updated ON public.product_components;
CREATE TRIGGER trg_product_components_updated
  BEFORE UPDATE ON public.product_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — SELECT: mesmo tenant | INSERT/UPDATE/DELETE: tenant + admin
-- ---------------------------------------------------------------------
ALTER TABLE public.work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;

-- work_centers
DROP POLICY IF EXISTS "work_centers_tenant_select" ON public.work_centers;
CREATE POLICY "work_centers_tenant_select"
  ON public.work_centers
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "work_centers_tenant_admin_insert" ON public.work_centers;
CREATE POLICY "work_centers_tenant_admin_insert"
  ON public.work_centers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS "work_centers_tenant_admin_update" ON public.work_centers;
CREATE POLICY "work_centers_tenant_admin_update"
  ON public.work_centers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS "work_centers_tenant_admin_delete" ON public.work_centers;
CREATE POLICY "work_centers_tenant_admin_delete"
  ON public.work_centers
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

-- products
DROP POLICY IF EXISTS "products_tenant_select" ON public.products;
CREATE POLICY "products_tenant_select"
  ON public.products
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "products_tenant_admin_insert" ON public.products;
CREATE POLICY "products_tenant_admin_insert"
  ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS "products_tenant_admin_update" ON public.products;
CREATE POLICY "products_tenant_admin_update"
  ON public.products
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS "products_tenant_admin_delete" ON public.products;
CREATE POLICY "products_tenant_admin_delete"
  ON public.products
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

-- product_components
DROP POLICY IF EXISTS "product_components_tenant_select" ON public.product_components;
CREATE POLICY "product_components_tenant_select"
  ON public.product_components
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "product_components_tenant_admin_insert" ON public.product_components;
CREATE POLICY "product_components_tenant_admin_insert"
  ON public.product_components
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS "product_components_tenant_admin_update" ON public.product_components;
CREATE POLICY "product_components_tenant_admin_update"
  ON public.product_components
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

DROP POLICY IF EXISTS "product_components_tenant_admin_delete" ON public.product_components;
CREATE POLICY "product_components_tenant_admin_delete"
  ON public.product_components
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

NOTIFY pgrst, 'reload schema';
