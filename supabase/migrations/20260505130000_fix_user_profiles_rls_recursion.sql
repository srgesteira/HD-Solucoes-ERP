-- =====================================================================
-- Fix: infinite recursion em RLS em public.user_profiles
--
-- A policy de SELECT consultava user_profiles por dentro da própria policy,
-- gerando recursão infinita. Usamos funções SECURITY DEFINER (bypass RLS
-- com controle explícito) para obter o tenant do caller + verificar mesmo tenant.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_same_tenant_user_profile(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND tenant_id = _tenant_id
  );
$$;

DROP POLICY IF EXISTS "user_profiles_self_read" ON public.user_profiles;
CREATE POLICY "user_profiles_self_read" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_same_tenant_user_profile(tenant_id)
  );

-- Mantém UPDATE apenas do próprio perfil (sem mudar)
-- (policy já existente será dropada e recriada para clareza)

DROP POLICY IF EXISTS "user_profiles_self_update" ON public.user_profiles;
CREATE POLICY "user_profiles_self_update" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

NOTIFY pgrst, 'reload schema';
