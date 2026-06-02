-- Etapa C: bloqueio de finalização de produção pelo CQ (histórico por order_item).

CREATE TABLE public.production_quality_finish_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE CASCADE,

  block_reason TEXT NOT NULL,
  blocked_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  release_action TEXT,
  released_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT production_quality_finish_blocks_block_reason_nonempty
    CHECK (length(trim(block_reason)) > 0),

  CONSTRAINT production_quality_finish_blocks_release_requires_action
    CHECK (
      released_at IS NULL
      OR (
        release_action IS NOT NULL
        AND length(trim(release_action)) > 0
        AND released_by IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.production_quality_finish_blocks IS
  'Histórico de bloqueios CQ que impedem finalizar produção (por order_item / linha de OP).';

CREATE UNIQUE INDEX uq_production_quality_finish_blocks_active
  ON public.production_quality_finish_blocks (tenant_id, order_item_id)
  WHERE released_at IS NULL;

CREATE INDEX idx_production_quality_finish_blocks_item_history
  ON public.production_quality_finish_blocks (tenant_id, order_item_id, blocked_at DESC);

CREATE INDEX idx_production_quality_finish_blocks_tenant
  ON public.production_quality_finish_blocks (tenant_id);

ALTER TABLE public.production_quality_finish_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_quality_finish_blocks_tenant_select"
  ON public.production_quality_finish_blocks;
CREATE POLICY "production_quality_finish_blocks_tenant_select"
  ON public.production_quality_finish_blocks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "production_quality_finish_blocks_tenant_admin_write"
  ON public.production_quality_finish_blocks;
CREATE POLICY "production_quality_finish_blocks_tenant_admin_write"
  ON public.production_quality_finish_blocks
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
