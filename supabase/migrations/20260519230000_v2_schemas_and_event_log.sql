-- HD ERP v2 — schemas modulares + event bus
-- Aplicar em projeto Supabase NOVO (hd-erp-v2)

CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS pcp;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS quality;
CREATE SCHEMA IF NOT EXISTS boards;

COMMENT ON SCHEMA sales IS 'Módulo vendas — orçamentos e pedidos';
COMMENT ON SCHEMA purchasing IS 'Módulo compras — PCs, requisições, NF fornecedor';
COMMENT ON SCHEMA pcp IS 'PCP, produção, inventário';
COMMENT ON SCHEMA finance IS 'Financeiro — AR, AP, fluxo de caixa';
COMMENT ON SCHEMA quality IS 'Qualidade — inspeções e NCs';
COMMENT ON SCHEMA boards IS 'Kanban / tarefas internas';

-- Bus de eventos (comunicação entre módulos)
CREATE TABLE IF NOT EXISTS public.event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id UUID NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_by JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_log_name_published
  ON public.event_log (event_name, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_log_tenant_published
  ON public.event_log (tenant_id, published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_log_idempotency
  ON public.event_log (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Licenciamento por tenant (Fase 5)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] DEFAULT ARRAY['core', 'boards'];

COMMENT ON COLUMN public.tenants.enabled_modules IS
  'Módulos activos para o tenant (feature flags comerciais).';

-- Realtime na event_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_log;
