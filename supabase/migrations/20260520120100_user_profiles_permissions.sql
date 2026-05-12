-- Permissões por módulo (JSONB) em user_profiles

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{
  "dashboard": true,
  "boards": true,
  "production": true,
  "purchasing": true,
  "sales": true,
  "products": true,
  "settings": true
}'::jsonb;

COMMENT ON COLUMN public.user_profiles.permissions IS 'Permissões por módulo: dashboard, boards, production, purchasing, sales, products, settings';

UPDATE public.user_profiles
SET
  permissions = '{
    "dashboard": true,
    "boards": true,
    "production": true,
    "purchasing": true,
    "sales": true,
    "products": true,
    "settings": true
  }'::jsonb
WHERE
  permissions IS NULL;

NOTIFY pgrst, 'reload schema';
