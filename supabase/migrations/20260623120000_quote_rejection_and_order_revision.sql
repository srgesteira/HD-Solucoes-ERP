-- Motivos de rejeição de orçamentos + versões de pedidos de venda

CREATE TABLE IF NOT EXISTS public.rejection_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rejection_reasons_tenant_reason_unique UNIQUE (tenant_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_rejection_reasons_tenant
  ON public.rejection_reasons(tenant_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.quote_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  rejection_reason_id UUID NOT NULL REFERENCES public.rejection_reasons(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_rejections_quote
  ON public.quote_rejections(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_rejections_tenant
  ON public.quote_rejections(tenant_id);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 1;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS original_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS revision_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_orders_original
  ON public.sales_orders(tenant_id, original_order_id);

-- Status superseded para pedidos substituídos por revisão
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (
    status IN (
      'pending',
      'confirmed',
      'in_production',
      'shipped',
      'delivered',
      'cancelled',
      'superseded'
    )
  );

-- Motivos padrão por tenant
INSERT INTO public.rejection_reasons (tenant_id, reason, sort_order)
SELECT t.id, v.reason, v.sort_order
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Preço alto', 1),
    ('Prazo de entrega não atendido', 2),
    ('Condições de pagamento não aceitas', 3),
    ('Produto indisponível', 4),
    ('Cliente desistiu', 5),
    ('Erro no orçamento', 6),
    ('Outro', 99)
) AS v(reason, sort_order)
ON CONFLICT (tenant_id, reason) DO NOTHING;

ALTER TABLE public.rejection_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY rejection_reasons_select ON public.rejection_reasons
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY rejection_reasons_admin ON public.rejection_reasons
  FOR ALL
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );

CREATE POLICY quote_rejections_select ON public.quote_rejections
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY quote_rejections_insert ON public.quote_rejections
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_current_user_tenant_admin()
  );
