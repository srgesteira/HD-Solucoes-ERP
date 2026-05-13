-- Garantir chave `reports` nas permissões existentes (default: acesso permitido)

UPDATE public.user_profiles
SET
  permissions = CASE
    WHEN permissions ? 'reports' THEN permissions
    ELSE COALESCE(permissions, '{}'::jsonb) || '{"reports": true}'::jsonb
  END;

COMMENT ON COLUMN public.user_profiles.permissions IS
  'Permissões por módulo: dashboard, boards, production, purchasing, sales, products, settings, reports';

NOTIFY pgrst, 'reload schema';
