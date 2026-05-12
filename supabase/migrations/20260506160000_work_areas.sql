-- Áreas de trabalho / centros de custo por tenant (para levantamento de esforço por área).

CREATE TABLE IF NOT EXISTS public.work_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT work_areas_tenant_code_key UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_work_areas_tenant_active
  ON public.work_areas(tenant_id, sort_order) WHERE NOT is_archived;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.work_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_area ON public.tasks(area_id) WHERE area_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_work_areas_updated ON public.work_areas;
CREATE TRIGGER trg_work_areas_updated
  BEFORE UPDATE ON public.work_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_areas_member_read" ON public.work_areas;
CREATE POLICY "work_areas_member_read" ON public.work_areas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.tenant_id = work_areas.tenant_id
    )
  );

DROP POLICY IF EXISTS "work_areas_admin_insert" ON public.work_areas;
CREATE POLICY "work_areas_admin_insert" ON public.work_areas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'admin'
        AND up.tenant_id = work_areas.tenant_id
    )
  );

DROP POLICY IF EXISTS "work_areas_admin_update" ON public.work_areas;
CREATE POLICY "work_areas_admin_update" ON public.work_areas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'admin'
        AND up.tenant_id = work_areas.tenant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'admin'
        AND up.tenant_id = work_areas.tenant_id
    )
  );

DROP POLICY IF EXISTS "work_areas_admin_delete" ON public.work_areas;
CREATE POLICY "work_areas_admin_delete" ON public.work_areas
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'admin'
        AND up.tenant_id = work_areas.tenant_id
    )
  );

INSERT INTO public.work_areas (tenant_id, code, name, sort_order)
SELECT t.id, v.code, v.name, v.ord::integer
FROM public.tenants t
CROSS JOIN (VALUES
  ('ADMIN', 'Administração / Gestão', 1000),
  ('COM', 'Comercial', 2000),
  ('PROJ', 'Projetos & Engenharia', 3000),
  ('OBR', 'Obra & Instalação', 4000),
  ('PCP', 'Planeamento / Produção', 4500),
  ('QUAL', 'Qualidade', 5000),
  ('FAT', 'Financeiro & Faturação', 6000),
  ('RH', 'Recursos Humanos', 7000),
  ('TI', 'TI & Sistemas', 8000),
  ('ASST', 'Assistência & Pós-venda', 8500),
  ('OUT', 'Outros / Não alocado', 9000)
) AS v(code, name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.work_areas w WHERE w.tenant_id = t.id);

NOTIFY pgrst, 'reload schema';
