-- LGPD: registo de consentimentos por utilizador/tenant

CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  version TEXT DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_privacy_consents_tenant ON public.privacy_consents (tenant_id);

CREATE INDEX IF NOT EXISTS idx_privacy_consents_user ON public.privacy_consents (user_profile_id);

ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_consents_self_insert" ON public.privacy_consents;

CREATE POLICY "privacy_consents_self_insert" ON public.privacy_consents FOR INSERT TO authenticated
  WITH CHECK (
    user_profile_id = auth.uid ()
    AND tenant_id = (
      SELECT tenant_id
      FROM public.user_profiles
      WHERE id = auth.uid ()
    )
  );

DROP POLICY IF EXISTS "privacy_consents_self_read" ON public.privacy_consents;

CREATE POLICY "privacy_consents_self_read" ON public.privacy_consents FOR SELECT TO authenticated
  USING (user_profile_id = auth.uid ());

DROP POLICY IF EXISTS "privacy_consents_admin_tenant_read" ON public.privacy_consents;

CREATE POLICY "privacy_consents_admin_tenant_read" ON public.privacy_consents FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

COMMENT ON TABLE public.privacy_consents IS 'Consentimentos LGPD (versão da política, IP opcional)';

NOTIFY pgrst, 'reload schema';
