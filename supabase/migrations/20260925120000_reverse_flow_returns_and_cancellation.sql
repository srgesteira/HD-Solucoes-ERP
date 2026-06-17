-- §10 do documento funcional: fluxo reverso (devolução de venda,
-- cancelamento de OP em andamento, devolução de compra). Cada operação
-- precisa de tabela própria — nunca sobrescreve o documento original.
-- O documento original fica imutável; a devolução/cancelamento é um
-- documento separado vinculado.

-- ---------------------------------------------------------------------
-- 1. SALES RETURNS — devolução de venda (§10.1).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  return_number TEXT NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders (id) ON DELETE RESTRICT,

  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL CHECK (
    reason IN (
      'defect',
      'customer_request',
      'wrong_item',
      'damaged_in_transit',
      'commercial_dispute',
      'other'
    )
  ),
  notes TEXT,

  /* Tipo de impacto financeiro:
     refund      — devolve dinheiro (cria payable contra o cliente / cancela receivable);
     credit_note — cliente fica com saldo a usar (gera credit_note);
     replacement — só troca produto, sem mexer financeiro. */
  financial_action TEXT NOT NULL DEFAULT 'refund' CHECK (
    financial_action IN ('refund', 'credit_note', 'replacement')
  ),

  /* Estoque é devolvido para qual local físico? */
  restock_location TEXT,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'authorized', 'received', 'cancelled')
  ),

  total_value NUMERIC(14, 2) NOT NULL DEFAULT 0,

  authorized_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ,
  received_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,

  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sales_returns_tenant_number_uidx UNIQUE (tenant_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant_status
  ON public.sales_returns (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_returns_sales_order
  ON public.sales_returns (sales_order_id);

DROP TRIGGER IF EXISTS set_sales_returns_updated_at ON public.sales_returns;
CREATE TRIGGER set_sales_returns_updated_at
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.sales_returns IS
  '§10.1 — devolução de venda. Documento separado, não altera o pedido original.';

-- ---------------------------------------------------------------------
-- 2. SALES RETURN ITEMS — linhas devolvidas (qty parcial possível).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  sales_return_id UUID NOT NULL REFERENCES public.sales_returns (id) ON DELETE CASCADE,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items (id) ON DELETE RESTRICT,

  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  description TEXT,

  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(14, 2) NOT NULL DEFAULT 0,

  condition TEXT NOT NULL DEFAULT 'a_grade' CHECK (
    condition IN ('a_grade', 'b_grade', 'scrap')
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_return_items_return
  ON public.sales_return_items (sales_return_id);

COMMENT ON TABLE public.sales_return_items IS
  '§10.1 — linhas devolvidas. Suporta devolução parcial e classifica condição (A/B/sucata).';

-- ---------------------------------------------------------------------
-- 3. PURCHASE RETURNS — devolução de compra (§10.3).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  return_number TEXT NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders (id) ON DELETE RESTRICT,

  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL CHECK (
    reason IN (
      'defect',
      'wrong_item',
      'damaged_in_transit',
      'over_received',
      'commercial_dispute',
      'other'
    )
  ),
  notes TEXT,

  /* Reversão financeira: refund → fornecedor devolve / credit → saldo. */
  financial_action TEXT NOT NULL DEFAULT 'refund' CHECK (
    financial_action IN ('refund', 'credit_note', 'replacement')
  ),

  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'authorized', 'sent', 'cancelled')
  ),

  total_value NUMERIC(14, 2) NOT NULL DEFAULT 0,

  authorized_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ,
  shipped_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  shipped_at TIMESTAMPTZ,

  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT purchase_returns_tenant_number_uidx UNIQUE (tenant_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_tenant_status
  ON public.purchase_returns (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_order
  ON public.purchase_returns (purchase_order_id);

DROP TRIGGER IF EXISTS set_purchase_returns_updated_at ON public.purchase_returns;
CREATE TRIGGER set_purchase_returns_updated_at
  BEFORE UPDATE ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.purchase_returns IS
  '§10.3 — devolução de compra ao fornecedor. Reverte landed cost.';

-- ---------------------------------------------------------------------
-- 4. PURCHASE RETURN ITEMS — linhas devolvidas ao fornecedor.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  purchase_return_id UUID NOT NULL REFERENCES public.purchase_returns (id) ON DELETE CASCADE,
  purchase_order_item_id UUID NOT NULL REFERENCES public.purchase_order_items (id) ON DELETE RESTRICT,

  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  description TEXT,

  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(14, 2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return
  ON public.purchase_return_items (purchase_return_id);

-- ---------------------------------------------------------------------
-- 5. CANCELAMENTO DE OP — campos extra em production_orders (§10.2).
--    A OP não é deletada — recebe status="cancelled" + metadados.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'production_orders'
      AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.production_orders
      ADD COLUMN cancelled_at TIMESTAMPTZ,
      ADD COLUMN cancelled_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
      ADD COLUMN cancellation_reason TEXT,
      ADD COLUMN cancellation_notes TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.production_orders.cancelled_at IS
  '§10.2 — OP cancelada em andamento. status passa a "cancelled" sem perder histórico de apontamento.';

-- ---------------------------------------------------------------------
-- 6. RLS — todas as tabelas seguem padrão tenant_id = current_tenant.
-- ---------------------------------------------------------------------
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_returns_tenant_select" ON public.sales_returns;
CREATE POLICY "sales_returns_tenant_select"
  ON public.sales_returns FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "sales_returns_tenant_modify" ON public.sales_returns;
CREATE POLICY "sales_returns_tenant_modify"
  ON public.sales_returns FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "sales_return_items_tenant_select" ON public.sales_return_items;
CREATE POLICY "sales_return_items_tenant_select"
  ON public.sales_return_items FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "sales_return_items_tenant_modify" ON public.sales_return_items;
CREATE POLICY "sales_return_items_tenant_modify"
  ON public.sales_return_items FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "purchase_returns_tenant_select" ON public.purchase_returns;
CREATE POLICY "purchase_returns_tenant_select"
  ON public.purchase_returns FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "purchase_returns_tenant_modify" ON public.purchase_returns;
CREATE POLICY "purchase_returns_tenant_modify"
  ON public.purchase_returns FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "purchase_return_items_tenant_select" ON public.purchase_return_items;
CREATE POLICY "purchase_return_items_tenant_select"
  ON public.purchase_return_items FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "purchase_return_items_tenant_modify" ON public.purchase_return_items;
CREATE POLICY "purchase_return_items_tenant_modify"
  ON public.purchase_return_items FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
