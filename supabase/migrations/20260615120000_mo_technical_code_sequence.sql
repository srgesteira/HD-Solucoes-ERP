-- Geração de código técnico MO-001, MO-002, … (prefixo MO sem família/material).

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
  IF NEW.technical_code IS NOT NULL AND LENGTH(TRIM(NEW.technical_code)) > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.prefix_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    pf.code INTO v_prefix_code
  FROM
    public.product_prefixes pf
  WHERE
    pf.id = NEW.prefix_id
    AND pf.tenant_id = NEW.tenant_id;

  IF v_prefix_code IS NULL THEN
    RAISE EXCEPTION 'Prefixo inválido ou não pertencente ao tenant';
  END IF;

  -- Prefixo MO: sequência MO-001, MO-002, … por tenant
  IF v_prefix_code = 'MO' THEN
    SELECT
      COALESCE(
        MAX((regexp_match (p.technical_code, '^MO-([0-9]+)$'))[1]::INT),
        0
      ) + 1 INTO v_next_seq
    FROM
      public.products AS p
    WHERE
      p.tenant_id = NEW.tenant_id
      AND p.technical_code ~ '^MO-[0-9]+$';

    NEW.technical_code := 'MO-' || LPAD(v_next_seq::TEXT, 3, '0');
    RETURN NEW;
  END IF;

  -- Demais prefixos: exige classificação completa
  IF NEW.family_id IS NULL
    OR NEW.subfamily_id IS NULL
    OR NEW.material_id IS NULL
    OR NEW.finish_id IS NULL THEN
    RAISE EXCEPTION 'Produto não-MO requer família, sub-família, material e acabamento';
  END IF;

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

  IF v_family_code IS NULL
    OR v_subfamily_code IS NULL
    OR v_material_code IS NULL
    OR v_finish_code IS NULL THEN
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

  NEW.technical_code := public.generate_technical_code(
    v_prefix_code,
    v_family_code,
    v_subfamily_code,
    v_material_code,
    v_finish_code,
    v_next_seq
  );

  RETURN NEW;
END;

$$;

-- Corrigir produtos MO já gravados com technical_code vazio (conflito de unicidade).
DO $$
DECLARE
  v_tenant_id UUID;
  v_product_id UUID;
  v_seq INT;
BEGIN
  FOR v_tenant_id IN
    SELECT DISTINCT
      p.tenant_id
    FROM
      public.products AS p
      INNER JOIN public.product_prefixes AS pf ON pf.id = p.prefix_id
        AND pf.code = 'MO'
    WHERE
      TRIM(COALESCE(p.technical_code, '')) = ''
  LOOP
    SELECT
      COALESCE(
        MAX((regexp_match (p.technical_code, '^MO-([0-9]+)$'))[1]::INT),
        0
      ) INTO v_seq
    FROM
      public.products AS p
    WHERE
      p.tenant_id = v_tenant_id
      AND p.technical_code ~ '^MO-[0-9]+$';

    FOR v_product_id IN
      SELECT
        p.id
      FROM
        public.products AS p
        INNER JOIN public.product_prefixes AS pf ON pf.id = p.prefix_id
          AND pf.code = 'MO'
      WHERE
        p.tenant_id = v_tenant_id
        AND TRIM(COALESCE(p.technical_code, '')) = ''
      ORDER BY
        p.created_at,
        p.id
    LOOP
      v_seq := v_seq + 1;
      UPDATE
        public.products
      SET
        technical_code = 'MO-' || LPAD(v_seq::TEXT, 3, '0')
      WHERE
        id = v_product_id;
    END LOOP;
  END LOOP;
END;

$$;
