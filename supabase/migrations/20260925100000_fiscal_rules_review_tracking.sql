-- §7.7 do documento funcional: manutenção fiscal.
-- Regra determinística envelhece se ninguém revisar — alíquota desatualizada
-- é aplicada com a mesma confiança com que acerta. Esta migração adiciona
-- rastreio de "última revisão" para que a contadora veja regras que precisam
-- ser conferidas, sem alterar como o motor escolhe a regra (que continua
-- determinístico por especificidade + priority).

-- ---------------------------------------------------------------------
-- 1. Colunas de rastreio em fiscal_rules (idempotente).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fiscal_rules'
      AND column_name = 'last_reviewed_at'
  ) THEN
    ALTER TABLE public.fiscal_rules
      ADD COLUMN last_reviewed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fiscal_rules'
      AND column_name = 'last_reviewed_by'
  ) THEN
    ALTER TABLE public.fiscal_rules
      ADD COLUMN last_reviewed_by UUID
      REFERENCES public.user_profiles (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fiscal_rules'
      AND column_name = 'review_interval_months'
  ) THEN
    ALTER TABLE public.fiscal_rules
      ADD COLUMN review_interval_months INT NOT NULL DEFAULT 12
      CHECK (review_interval_months > 0 AND review_interval_months <= 120);
  END IF;
END $$;

COMMENT ON COLUMN public.fiscal_rules.last_reviewed_at IS
  'Data da última conferência da regra pela contadora. Regras sem revisão há mais de review_interval_months entram no painel "Regras a revisar".';

COMMENT ON COLUMN public.fiscal_rules.review_interval_months IS
  'Intervalo (em meses) entre revisões obrigatórias. Default 12. Por regra (uma regra crítica pode exigir revisão semestral).';

-- ---------------------------------------------------------------------
-- 2. View — regras a revisar (nunca revisadas OU vencidas no intervalo).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fiscal_rules_to_review
WITH (security_invoker = true)
AS
SELECT
  fr.id,
  fr.tenant_id,
  fr.name,
  fr.priority,
  fr.is_active,
  fr.valid_from,
  fr.valid_until,
  fr.last_reviewed_at,
  fr.review_interval_months,
  CASE
    WHEN fr.last_reviewed_at IS NULL THEN true
    WHEN fr.last_reviewed_at < NOW() - (fr.review_interval_months || ' months')::INTERVAL THEN true
    ELSE false
  END AS needs_review,
  CASE
    WHEN fr.valid_until IS NOT NULL
      AND fr.valid_until < CURRENT_DATE THEN true
    ELSE false
  END AS is_expired,
  CASE
    WHEN fr.valid_until IS NOT NULL
      AND fr.valid_until >= CURRENT_DATE
      AND fr.valid_until < CURRENT_DATE + INTERVAL '60 days' THEN true
    ELSE false
  END AS is_expiring_soon
FROM public.fiscal_rules fr;

COMMENT ON VIEW public.v_fiscal_rules_to_review IS
  '§7.7 — derivado de fiscal_rules. needs_review=true sinaliza no painel; is_expired/is_expiring_soon dão urgência.';

NOTIFY pgrst, 'reload schema';
