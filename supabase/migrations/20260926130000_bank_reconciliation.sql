-- Frente 7: conciliação bancária (importação + match).

CREATE TABLE IF NOT EXISTS public.bank_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL CHECK (file_format IN ('ofx', 'csv')),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processed', 'failed')
  ),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  bank_import_id UUID NOT NULL REFERENCES public.bank_imports (id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  description TEXT,
  document_number TEXT,
  matched_receivable_id UUID REFERENCES public.receivables (id) ON DELETE SET NULL,
  matched_payable_id UUID REFERENCES public.accounts_payable (id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (
    match_status IN ('unmatched', 'matched', 'ignored')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_tenant_date
  ON public.bank_statement_lines (tenant_id, transaction_date DESC);

ALTER TABLE public.bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_imports_tenant ON public.bank_imports
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY bank_statement_lines_tenant ON public.bank_statement_lines
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
