-- Garante a tabela sales_order_logs (idempotente).
-- Execute no SQL Editor do Supabase se a migration 20260702120000 ainda não foi aplicada.

CREATE TABLE IF NOT EXISTS public.sales_order_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_order_logs_order
  ON public.sales_order_logs(tenant_id, sales_order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_order_logs_tenant
  ON public.sales_order_logs(tenant_id);

COMMENT ON TABLE public.sales_order_logs IS
  'Auditoria de alterações em pedidos de venda (campo a campo).';

ALTER TABLE public.sales_order_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_logs_select ON public.sales_order_logs;
CREATE POLICY sales_order_logs_select ON public.sales_order_logs
  FOR SELECT USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS sales_order_logs_insert ON public.sales_order_logs;
CREATE POLICY sales_order_logs_insert ON public.sales_order_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());
