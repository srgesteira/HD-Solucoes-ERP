-- Frente 2 Fatia 2.1: movimentos financeiros realizados (append-only).
-- 1 linha = 1 evento de pagamento/recebimento (parcial ou total).

CREATE TABLE IF NOT EXISTS public.financial_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  movement_date DATE NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('payable', 'receivable', 'manual')),
  source_id UUID NOT NULL,
  description TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_financial_movements_tenant_date
  ON public.financial_movements (tenant_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_movements_tenant_source
  ON public.financial_movements (tenant_id, source_kind, source_id);

ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_movements_select ON public.financial_movements;

CREATE POLICY financial_movements_select ON public.financial_movements
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS financial_movements_insert ON public.financial_movements;

CREATE POLICY financial_movements_insert ON public.financial_movements
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

COMMENT ON TABLE public.financial_movements IS
  'Extrato financeiro realizado: 1 linha imutável por evento de pagamento/recebimento. '
  'Fontes: accounts_payable, receivables, cash_flow_entries (manual, futuro).';

NOTIFY pgrst, 'reload schema';
