-- Workflow comercial ↔ engenharia ↔ orçamento

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS composition_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engineering_workflow_status TEXT,
  ADD COLUMN IF NOT EXISTS engineering_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_for_sale BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS released_for_sale_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_quote_id UUID REFERENCES public.quotes (id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS awaiting_commercial_finalize BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_engineering_pending
  ON public.products (tenant_id, engineering_workflow_status)
  WHERE engineering_workflow_status = 'pending_composition';

CREATE INDEX IF NOT EXISTS idx_quotes_awaiting_commercial
  ON public.quotes (tenant_id, awaiting_commercial_finalize)
  WHERE awaiting_commercial_finalize = TRUE;

COMMENT ON COLUMN public.products.engineering_workflow_status IS
  'pending_composition | released — pedido pelo comercial até engenharia concluir BOM';
COMMENT ON COLUMN public.quotes.awaiting_commercial_finalize IS
  'TRUE quando engenharia libertou custo/estrutura e o comercial deve rever o orçamento';
