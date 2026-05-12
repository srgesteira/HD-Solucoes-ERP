-- Sistema de código técnico: HD1-A10A10-001

-- ---------------------------------------------------------------------------
-- 1. Prefixos (HD1, HD2, HD3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_prefixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code IN ('HD1', 'HD2', 'HD3')),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_prefixes_tenant_code UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------------
-- 2. Famílias (A, B, C...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_families_tenant_code UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------------
-- 3. Sub-famílias (10, 11, 20...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_subfamilies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.product_families (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_subfamilies_tenant_family_code UNIQUE (tenant_id, family_id, code)
);

-- ---------------------------------------------------------------------------
-- 4. Materiais (A, B, C)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code IN ('A', 'B', 'C')),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_materials_tenant_code UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------------
-- 5. Acabamentos (10, 11, 12, 13)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_finishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code IN ('10', '11', '12', '13')),
  name TEXT NOT NULL,
  material_id UUID REFERENCES public.product_materials (id),
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_finishes_tenant_code UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------------
-- 6. Colunas em products
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS prefix_id UUID REFERENCES public.product_prefixes (id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.product_families (id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS subfamily_id UUID REFERENCES public.product_subfamilies (id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES public.product_materials (id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS finish_id UUID REFERENCES public.product_finishes (id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS technical_code TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_composition BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_technical_code_uidx ON public.products (tenant_id, technical_code)
WHERE
  technical_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Função montagem do código
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_technical_code(
  p_prefix_code TEXT,
  p_family_code TEXT,
  p_subfamily_code TEXT,
  p_material_code TEXT,
  p_finish_code TEXT,
  p_sequence INT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
SELECT UPPER(
  p_prefix_code || '-' || p_family_code || p_subfamily_code || p_material_code || p_finish_code || '-' ||
  LPAD (p_sequence::TEXT, 3, '0')
);
$$;

-- ---------------------------------------------------------------------------
-- 8. Trigger: próximo sequencial e preenchimento de technical_code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_generate_technical_code ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix_code TEXT;

  v_family_code TEXT;

  v_subfamily_code TEXT;

  v_material_code TEXT;

  v_finish_code TEXT;

  v_next_seq INT;

BEGIN
  IF NEW.prefix_id IS NULL OR NEW.family_id IS NULL OR NEW.subfamily_id IS NULL OR NEW.material_id IS NULL OR NEW.finish_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.technical_code IS NOT NULL AND LENGTH(TRIM(NEW.technical_code)) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    pf.code INTO v_prefix_code
  FROM
    public.product_prefixes pf
  WHERE
    pf.id = NEW.prefix_id
    AND pf.tenant_id = NEW.tenant_id;

  SELECT
    f.code INTO v_family_code
  FROM
    public.product_families f
  WHERE
    f.id = NEW.family_id
    AND f.tenant_id = NEW.tenant_id;

  SELECT
    sf.code INTO v_subfamily_code
  FROM
    public.product_subfamilies sf
  WHERE
    sf.id = NEW.subfamily_id
    AND sf.tenant_id = NEW.tenant_id;

  SELECT
    m.code INTO v_material_code
  FROM
    public.product_materials m
  WHERE
    m.id = NEW.material_id
    AND m.tenant_id = NEW.tenant_id;

  SELECT
    fn.code INTO v_finish_code
  FROM
    public.product_finishes fn
  WHERE
    fn.id = NEW.finish_id
    AND fn.tenant_id = NEW.tenant_id;

  IF v_prefix_code IS NULL OR v_family_code IS NULL OR v_subfamily_code IS NULL OR v_material_code IS NULL OR v_finish_code IS NULL THEN
    RAISE EXCEPTION 'Referência de código técnico inválida ou não pertencente ao tenant';
  END IF;

  SELECT
    COALESCE(MAX((regexp_match (p.technical_code, '-([0-9]{3})$'))[1]::INT), 0) + 1 INTO v_next_seq
  FROM
    public.products AS p
  WHERE
    p.tenant_id = NEW.tenant_id
    AND p.prefix_id = NEW.prefix_id
    AND p.family_id = NEW.family_id
    AND p.subfamily_id = NEW.subfamily_id
    AND p.material_id = NEW.material_id
    AND p.finish_id = NEW.finish_id
    AND p.technical_code IS NOT NULL
    AND p.technical_code ~ '-[0-9]{3}$';

  NEW.technical_code :=
    public.generate_technical_code(v_prefix_code, v_family_code, v_subfamily_code, v_material_code, v_finish_code,
      v_next_seq);

  RETURN NEW;
END;

$$;

DROP TRIGGER IF EXISTS trigger_auto_generate_technical_code ON public.products;

CREATE TRIGGER trigger_auto_generate_technical_code
BEFORE INSERT ON public.products FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_technical_code ();

-- ---------------------------------------------------------------------------
-- 9. Índices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_technical_code ON public.products (technical_code);

CREATE INDEX IF NOT EXISTS idx_product_prefixes_tenant ON public.product_prefixes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_families_tenant ON public.product_families (tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_subfamilies_tenant ON public.product_subfamilies (tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_materials_tenant ON public.product_materials (tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_finishes_tenant ON public.product_finishes (tenant_id);

-- ---------------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_prefixes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_families ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_subfamilies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_finishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_prefixes_select" ON public.product_prefixes FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_prefixes_insert" ON public.product_prefixes FOR INSERT WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY "product_prefixes_update" ON public.product_prefixes FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_prefixes_delete" ON public.product_prefixes FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "product_families_select" ON public.product_families FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_families_insert" ON public.product_families FOR INSERT WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY "product_families_update" ON public.product_families FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_families_delete" ON public.product_families FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "product_subfamilies_select" ON public.product_subfamilies FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_subfamilies_insert" ON public.product_subfamilies FOR INSERT WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY "product_subfamilies_update" ON public.product_subfamilies FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_subfamilies_delete" ON public.product_subfamilies FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "product_materials_select" ON public.product_materials FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_materials_insert" ON public.product_materials FOR INSERT WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY "product_materials_update" ON public.product_materials FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_materials_delete" ON public.product_materials FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "product_finishes_select" ON public.product_finishes FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_finishes_insert" ON public.product_finishes FOR INSERT WITH CHECK (
  tenant_id = public.get_current_tenant_id ()
  AND public.is_current_user_tenant_admin ()
);

CREATE POLICY "product_finishes_update" ON public.product_finishes FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "product_finishes_delete" ON public.product_finishes FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

-- ---------------------------------------------------------------------------
-- 11. updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS product_prefixes_updated_at ON public.product_prefixes;

CREATE TRIGGER product_prefixes_updated_at
BEFORE UPDATE ON public.product_prefixes FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS product_families_updated_at ON public.product_families;

CREATE TRIGGER product_families_updated_at
BEFORE UPDATE ON public.product_families FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS product_subfamilies_updated_at ON public.product_subfamilies;

CREATE TRIGGER product_subfamilies_updated_at
BEFORE UPDATE ON public.product_subfamilies FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS product_materials_updated_at ON public.product_materials;

CREATE TRIGGER product_materials_updated_at
BEFORE UPDATE ON public.product_materials FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();

DROP TRIGGER IF EXISTS product_finishes_updated_at ON public.product_finishes;

CREATE TRIGGER product_finishes_updated_at
BEFORE UPDATE ON public.product_finishes FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- 12. Dados iniciais por tenant existente (primeira linha)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tenant_id UUID;

BEGIN
  SELECT
    t.id INTO v_tenant_id
  FROM
    public.tenants AS t
  ORDER BY
    t.created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;

  END IF;

  INSERT INTO public.product_prefixes(tenant_id, code, name)
    VALUES (v_tenant_id, 'HD1', 'Produtos Vendidos'),
(v_tenant_id, 'HD2', 'Produtos Industrializados'),
(v_tenant_id, 'HD3', 'Produtos Revendidos')
  ON CONFLICT ON CONSTRAINT product_prefixes_tenant_code DO NOTHING;

  INSERT INTO public.product_materials(tenant_id, code, name, sort_order)
    VALUES (v_tenant_id, 'A', 'Aço Galvanizado', 1),
(v_tenant_id, 'B', 'Alumínio', 2),
(v_tenant_id, 'C', 'Inox', 3)
  ON CONFLICT ON CONSTRAINT product_materials_tenant_code DO NOTHING;

  INSERT INTO public.product_finishes(tenant_id, code, name, sort_order)
    VALUES (v_tenant_id, '10', 'Sem acabamento', 1),
(v_tenant_id, '11', 'Pintado', 2),
(v_tenant_id, '12', 'Inox 304', 3),
(v_tenant_id, '13', 'Inox 316', 4)
  ON CONFLICT ON CONSTRAINT product_finishes_tenant_code DO NOTHING;

  INSERT INTO public.product_families(tenant_id, code, name, sort_order)
    VALUES (v_tenant_id, 'A', 'Fluxos', 1),
(v_tenant_id, 'B', 'Caixa Terminal', 2),
(v_tenant_id, 'C', 'Caixas Entre Dutos', 3),
(v_tenant_id, 'D', 'Caixas de Ventilação', 4),
(v_tenant_id, 'E', 'BiBo', 5),
(v_tenant_id, 'F', 'Caixas Especiais', 6),
(v_tenant_id, 'G', 'Daikin', 7)
  ON CONFLICT ON CONSTRAINT product_families_tenant_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '10',
      'Fluxo Laminar',
      1
    FROM
      public.product_families
    WHERE
      code = 'A'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '11',
      'Fan Filter',
      2
    FROM
      public.product_families
    WHERE
      code = 'A'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '20',
      'Saída Superior Redonda',
      1
    FROM
      public.product_families
    WHERE
      code = 'B'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '21',
      'Saída Superior Retangular',
      2
    FROM
      public.product_families
    WHERE
      code = 'B'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '22',
      'Saída Lateral Redonda',
      3
    FROM
      public.product_families
    WHERE
      code = 'B'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '23',
      'Saída Lateral Retangular',
      4
    FROM
      public.product_families
    WHERE
      code = 'B'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '30',
      'Para Filtro Hepa',
      1
    FROM
      public.product_families
    WHERE
      code = 'C'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '31',
      'Para Filtro Fino',
      2
    FROM
      public.product_families
    WHERE
      code = 'C'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '32',
      'Trilho',
      3
    FROM
      public.product_families
    WHERE
      code = 'C'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '33',
      'Para Filtro Hepa e Fino',
      4
    FROM
      public.product_families
    WHERE
      code = 'C'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '40',
      'Para Filtro Hepa',
      1
    FROM
      public.product_families
    WHERE
      code = 'D'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '41',
      'Para Filtro Fino',
      2
    FROM
      public.product_families
    WHERE
      code = 'D'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '42',
      'Trilho',
      3
    FROM
      public.product_families
    WHERE
      code = 'D'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

  INSERT INTO public.product_subfamilies(tenant_id, family_id, code, name, sort_order)
    SELECT
      v_tenant_id,
      id,
      '43',
      'Para Filtro Hepa e Fino',
      4
    FROM
      public.product_families
    WHERE
      code = 'D'
      AND tenant_id = v_tenant_id
  ON CONFLICT ON CONSTRAINT product_subfamilies_tenant_family_code DO NOTHING;

END
$$;
