-- Catálogo inicial de famílias por sufixo simplificado (MP, SE, EB, MC, RV, MO).
-- MP: espelha os materiais activos do tenant (Aço, Alumínio, Tinta, etc.).
-- Demais sufixos: conjunto padrão por natureza do prefixo.

-- MP — famílias alinhadas aos materiais já cadastrados
INSERT INTO public.product_families (tenant_id, prefix_id, code, name, sort_order, is_active)
SELECT
  px.tenant_id,
  px.id,
  m.code,
  m.name,
  m.sort_order,
  true
FROM
  public.product_prefixes px
  INNER JOIN public.product_materials m ON m.tenant_id = px.tenant_id
    AND m.is_active = true
WHERE
  px.code = 'MP'
  AND px.is_active = true
ON CONFLICT (tenant_id, prefix_id, code)
  WHERE prefix_id IS NOT NULL
  DO NOTHING;

-- SE, EB, MC, RV, MO — catálogo padrão por tenant/prefixo
DO $$
DECLARE
  v_tenant_id UUID;
  v_prefix_id UUID;
  v_prefix_code TEXT;
  v_family RECORD;
BEGIN
  FOR v_tenant_id IN
    SELECT
      t.id
    FROM
      public.tenants AS t
  LOOP
    FOR v_prefix_code IN
      SELECT
        unnest(ARRAY['SE', 'EB', 'MC', 'RV', 'MO'])
    LOOP
      SELECT
        p.id INTO v_prefix_id
      FROM
        public.product_prefixes p
      WHERE
        p.tenant_id = v_tenant_id
        AND p.code = v_prefix_code
        AND p.is_active = true;

      IF v_prefix_id IS NULL THEN
        CONTINUE;
      END IF;

      FOR v_family IN
        SELECT
          *
        FROM (
          VALUES
            ('SE', 'A', 'Peça em processo', 1),
            ('SE', 'B', 'Peça pintada / acabada', 2),
            ('SE', 'C', 'Subconjunto', 3),
            ('EB', 'A', 'Embalagem primária', 1),
            ('EB', 'B', 'Embalagem secundária', 2),
            ('EB', 'C', 'Proteção / filme', 3),
            ('MC', 'A', 'Consumível de produção', 1),
            ('MC', 'B', 'Consumível geral', 2),
            ('MC', 'C', 'EPI / segurança', 3),
            ('RV', 'A', 'Equipamento revenda', 1),
            ('RV', 'B', 'Acessório revenda', 2),
            ('MO', 'A', 'Mão de obra interna', 1),
            ('MO', 'B', 'Mão de obra externa', 2)
        ) AS seed(prefix_code, code, name, sort_order)
        WHERE
          seed.prefix_code = v_prefix_code
      LOOP
        INSERT INTO public.product_families (
          tenant_id,
          prefix_id,
          code,
          name,
          sort_order,
          is_active
        )
        VALUES (
          v_tenant_id,
          v_prefix_id,
          v_family.code,
          v_family.name,
          v_family.sort_order,
          true
        )
        ON CONFLICT (tenant_id, prefix_id, code)
          WHERE prefix_id IS NOT NULL
          DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
