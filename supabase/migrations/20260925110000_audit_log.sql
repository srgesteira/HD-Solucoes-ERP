-- §14 do documento funcional: Trilha de auditoria.
-- Tabela única `audit_log` que recebe quem fez, o quê, quando e em qual
-- registo, com diff de campos. Triggers cobrem as tabelas críticas.
-- Toda escrita passa pelo trigger; nada faz INSERT direto na audit_log
-- a partir do app (a não ser eventos de domínio explícitos).

-- ---------------------------------------------------------------------
-- 1. Tabela audit_log (idempotente).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  /* Quem (NULL = sistema/trigger sem JWT — ex.: serviço/admin script). */
  actor_id UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  actor_email TEXT,

  /* O quê. */
  action TEXT NOT NULL CHECK (
    action IN ('insert', 'update', 'delete', 'event')
  ),
  table_name TEXT NOT NULL,
  record_id UUID,

  /* Diff de campos relevantes (snapshot antes/depois). */
  before JSONB,
  after JSONB,
  changed_fields TEXT[],

  /* Eventos de domínio explícitos (ex.: "approved", "rejected"). */
  event_kind TEXT,
  event_payload JSONB,

  /* Quando (com timestamp do servidor). */
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_table_record
  ON public.audit_log (tenant_id, table_name, record_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_actor
  ON public.audit_log (tenant_id, actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at
  ON public.audit_log (tenant_id, occurred_at DESC);

COMMENT ON TABLE public.audit_log IS
  'Trilha de auditoria: quem fez o quê e quando. Imutável depois de gravada.';

-- ---------------------------------------------------------------------
-- 2. Função de log automática para tabelas com tenant_id+id.
--    Captura before/after, calcula changed_fields, ignora updates
--    sem mudança real (changed_fields vazio).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor UUID;
  v_actor_email TEXT;
  v_tenant UUID;
  v_record UUID;
  v_action TEXT;
  v_before JSONB;
  v_after JSONB;
  v_changed TEXT[];
  v_key TEXT;
BEGIN
  /* Resolve actor a partir do JWT (auth.uid()), se houver. */
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF v_actor IS NOT NULL THEN
    SELECT email INTO v_actor_email
    FROM public.user_profiles
    WHERE id = v_actor;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_tenant := (NEW.tenant_id)::UUID;
    v_record := (NEW.id)::UUID;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_tenant := (NEW.tenant_id)::UUID;
    v_record := (NEW.id)::UUID;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_tenant := (OLD.tenant_id)::UUID;
    v_record := (OLD.id)::UUID;
  END IF;

  /* Calcula changed_fields para UPDATE ignorando updated_at. */
  IF TG_OP = 'UPDATE' THEN
    v_changed := ARRAY[]::TEXT[];
    FOR v_key IN SELECT jsonb_object_keys(v_after) LOOP
      IF v_key IN ('updated_at') THEN CONTINUE; END IF;
      IF (v_before -> v_key) IS DISTINCT FROM (v_after -> v_key) THEN
        v_changed := array_append(v_changed, v_key);
      END IF;
    END LOOP;
    /* Update sem mudança real → não polui o log. */
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    v_changed := NULL;
  END IF;

  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    actor_email,
    action,
    table_name,
    record_id,
    before,
    after,
    changed_fields
  ) VALUES (
    v_tenant,
    v_actor,
    v_actor_email,
    v_action,
    TG_TABLE_NAME,
    v_record,
    v_before,
    v_after,
    v_changed
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.audit_log_record_change() IS
  'Trigger genérico de auditoria: usa tenant_id + id da linha. Ignora updated_at puro.';

-- ---------------------------------------------------------------------
-- 3. Aplicar trigger às tabelas críticas.
--    Lista deliberadamente curta — começamos pelo dinheiro/cliente/fiscal.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  watched TEXT[] := ARRAY[
    'quotes',
    'sales_orders',
    'sales_order_items',
    'purchase_orders',
    'purchase_order_items',
    'production_orders',
    'customers',
    'suppliers',
    'products',
    'fiscal_rules',
    -- A tabela física é accounts_payable, não payables.
    'accounts_payable',
    'receivables',
    'inventory_movements',
    -- §10 fluxo reverso e §9 transporte:
    'sales_returns',
    'purchase_returns',
    'shipments'
  ];
BEGIN
  FOREACH t IN ARRAY watched LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_audit_log_%I ON public.%I',
        t, t
      );
      EXECUTE format(
        'CREATE TRIGGER trg_audit_log_%I
          AFTER INSERT OR UPDATE OR DELETE ON public.%I
          FOR EACH ROW EXECUTE FUNCTION public.audit_log_record_change()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4. RLS — leitura pelo próprio tenant; escrita só via trigger ou admin.
-- ---------------------------------------------------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select"
  ON public.audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

-- Ninguém faz INSERT a partir do app autenticado:
-- triggers usam SECURITY DEFINER e contornam RLS.
-- INSERTs de eventos explícitos do app passam pelo Service Role.

NOTIFY pgrst, 'reload schema';
