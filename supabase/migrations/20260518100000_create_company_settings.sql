-- =====================================================
-- CONFIGURAÇÕES DA EMPRESA (TENANT)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    cnpj TEXT,
    company_name TEXT NOT NULL,
    trade_name TEXT,
    state_registration TEXT,
    municipal_registration TEXT,

    tax_regime TEXT CHECK (
        tax_regime IS NULL
        OR tax_regime IN (
            'simples_nacional',
            'lucro_presumido',
            'lucro_real'
        )
    ),

    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,

    phone TEXT,
    email TEXT,
    website TEXT,

    logo_url TEXT,

    document_header TEXT,
    document_footer TEXT,

    default_ncm TEXT DEFAULT '84213990',
    default_payment_terms TEXT DEFAULT '30 dias',
    default_delivery_days INT DEFAULT 30,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_company_settings_tenant ON public.company_settings (tenant_id);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_select" ON public.company_settings FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "company_settings_insert" ON public.company_settings FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "company_settings_update" ON public.company_settings FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

DROP TRIGGER IF EXISTS company_settings_updated_at ON public.company_settings;

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at ();

-- Uma linha por tenant (razão social = nome do tenant)
INSERT INTO public.company_settings (tenant_id, company_name, trade_name)
SELECT
  t.id,
  t.name,
  t.name
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;

COMMENT ON TABLE public.company_settings IS 'Dados cadastrais e documentos da empresa por tenant';

-- Bucket público para logos (URL pública; path = {tenant_id}/ficheiro)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública dos ficheiros do bucket (URLs públicas)
DROP POLICY IF EXISTS "company_logos_public_read" ON storage.objects;
CREATE POLICY "company_logos_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

-- Utilizadores autenticados podem enviar logos apenas na pasta do seu tenant (/{tenant_id}/...)
DROP POLICY IF EXISTS "company_logos_tenant_insert" ON storage.objects;
CREATE POLICY "company_logos_tenant_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) = public.get_current_tenant_id()::text
    AND public.is_current_user_tenant_admin ()
  );

DROP POLICY IF EXISTS "company_logos_tenant_update" ON storage.objects;
CREATE POLICY "company_logos_tenant_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) = public.get_current_tenant_id()::text
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) = public.get_current_tenant_id()::text
    AND public.is_current_user_tenant_admin ()
  );

DROP POLICY IF EXISTS "company_logos_tenant_delete" ON storage.objects;
CREATE POLICY "company_logos_tenant_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-logos'
    AND split_part(name, '/', 1) = public.get_current_tenant_id()::text
    AND public.is_current_user_tenant_admin ()
  );

NOTIFY pgrst, 'reload schema';
