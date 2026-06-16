-- Biblioteca de documentos por produto (desenho, manual, instrução, POP).
-- Bucket privado: path = {tenant_id}/products/{product_id}/{uuid}-{filename}

-- ---------------------------------------------------------------------
-- 1. Tabela product_documents
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('drawing', 'manual', 'work_instruction', 'pop')
  ),
  name TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT 'A',
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT CHECK (
    file_size_bytes IS NULL OR file_size_bytes >= 0
  ),
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_documents_tenant_product_kind_name_revision_uidx
    UNIQUE (tenant_id, product_id, kind, name, revision),
  CONSTRAINT product_documents_storage_path_uidx UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_product_documents_tenant_product
  ON public.product_documents (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_documents_product_kind
  ON public.product_documents (product_id, kind, uploaded_at DESC);

COMMENT ON TABLE public.product_documents IS
  'Metadados de ficheiros de engenharia ligados a produtos (storage_path no bucket product-documents).';
COMMENT ON COLUMN public.product_documents.kind IS
  'drawing | manual | work_instruction | pop';
COMMENT ON COLUMN public.product_documents.storage_path IS
  'Path no bucket product-documents: {tenant_id}/products/{product_id}/{uuid}-{filename}';
COMMENT ON COLUMN public.product_documents.revision IS
  'Revisão do documento; novas revisões são linhas novas (histórico).';

-- Impede product_id de outro tenant.
CREATE OR REPLACE FUNCTION public.product_documents_enforce_product_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prod_tenant UUID;
BEGIN
  SELECT p.tenant_id INTO prod_tenant
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF prod_tenant IS NULL THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  IF prod_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'product_tenant_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_documents_enforce_product_tenant ON public.product_documents;
CREATE TRIGGER trg_product_documents_enforce_product_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, product_id
  ON public.product_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.product_documents_enforce_product_tenant();

DROP TRIGGER IF EXISTS set_product_documents_updated_at ON public.product_documents;
CREATE TRIGGER set_product_documents_updated_at
  BEFORE UPDATE ON public.product_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. RLS product_documents (isolamento por tenant)
-- ---------------------------------------------------------------------
ALTER TABLE public.product_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_documents_tenant_select" ON public.product_documents;
CREATE POLICY "product_documents_tenant_select"
  ON public.product_documents
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "product_documents_tenant_insert" ON public.product_documents;
CREATE POLICY "product_documents_tenant_insert"
  ON public.product_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_id
        AND p.tenant_id = public.get_current_tenant_id ()
    )
  );

DROP POLICY IF EXISTS "product_documents_tenant_update" ON public.product_documents;
CREATE POLICY "product_documents_tenant_update"
  ON public.product_documents
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_id
        AND p.tenant_id = public.get_current_tenant_id ()
    )
  );

DROP POLICY IF EXISTS "product_documents_tenant_delete" ON public.product_documents;
CREATE POLICY "product_documents_tenant_delete"
  ON public.product_documents
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

-- ---------------------------------------------------------------------
-- 3. Storage — bucket privado product-documents
-- Path obrigatório: {tenant_id}/products/{product_id}/{uuid}-{filename}
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-documents', 'product-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Leitura: só ficheiros na pasta do tenant corrente.
DROP POLICY IF EXISTS "product_documents_tenant_select" ON storage.objects;
CREATE POLICY "product_documents_tenant_select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-documents'
    AND split_part(name, '/', 1) = public.get_current_tenant_id ()::text
    AND split_part(name, '/', 2) = 'products'
  );

DROP POLICY IF EXISTS "product_documents_tenant_insert" ON storage.objects;
CREATE POLICY "product_documents_tenant_insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-documents'
    AND split_part(name, '/', 1) = public.get_current_tenant_id ()::text
    AND split_part(name, '/', 2) = 'products'
  );

DROP POLICY IF EXISTS "product_documents_tenant_update" ON storage.objects;
CREATE POLICY "product_documents_tenant_update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-documents'
    AND split_part(name, '/', 1) = public.get_current_tenant_id ()::text
    AND split_part(name, '/', 2) = 'products'
  )
  WITH CHECK (
    bucket_id = 'product-documents'
    AND split_part(name, '/', 1) = public.get_current_tenant_id ()::text
    AND split_part(name, '/', 2) = 'products'
  );

DROP POLICY IF EXISTS "product_documents_tenant_delete" ON storage.objects;
CREATE POLICY "product_documents_tenant_delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-documents'
    AND split_part(name, '/', 1) = public.get_current_tenant_id ()::text
    AND split_part(name, '/', 2) = 'products'
  );

NOTIFY pgrst, 'reload schema';
