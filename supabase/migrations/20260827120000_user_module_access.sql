-- Fase 3: acesso por módulo (menu) + catálogo de cargos R2

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  module_key TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{"screens":[],"actions":[]}'::jsonb,
  description TEXT,
  module_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
);

COMMENT ON TABLE public.role_permissions IS
  'Catálogo de cargos industriais R2 (perfil → module_keys + permissions JSON).';

COMMENT ON COLUMN public.role_permissions.module_keys IS
  'Módulos liberados ao aplicar este cargo no utilizador (chaves PT do menu).';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS role_keys TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.user_profiles.enabled_modules IS
  'Módulos visíveis no menu. ["*"] = todos. Vazio = derivar de permissions legado.';

COMMENT ON COLUMN public.user_profiles.role_keys IS
  'Cargos R2 aplicados (role_permissions.role_key).';

UPDATE public.user_profiles
SET enabled_modules = ARRAY['*']::TEXT[]
WHERE role = 'admin'
  AND (enabled_modules IS NULL OR enabled_modules = ARRAY[]::TEXT[]);
