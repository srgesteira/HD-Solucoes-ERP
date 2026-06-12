-- Saldo inicial configurável para projeção de fluxo de caixa.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS cash_flow_opening_balance numeric(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.company_settings.cash_flow_opening_balance IS
  'Saldo em caixa (R$) no início da projeção em /reports/cash-flow.';
