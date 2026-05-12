-- Configurações de BDI por tenant + função de preço + colunas opcionais em products

CREATE TABLE IF NOT EXISTS public.bdi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  tax_icms NUMERIC(5, 2) DEFAULT 0,
  tax_pis NUMERIC(5, 2) DEFAULT 0,
  tax_cofins NUMERIC(5, 2) DEFAULT 0,
  tax_ipi NUMERIC(5, 2) DEFAULT 0,
  tax_iss NUMERIC(5, 2) DEFAULT 0,

  admin_overhead NUMERIC(5, 2) DEFAULT 15,
  commercial_overhead NUMERIC(5, 2) DEFAULT 10,
  financial_overhead NUMERIC(5, 2) DEFAULT 5,

  profit_margin NUMERIC(5, 2) DEFAULT 20,

  use_compound_bdi BOOLEAN DEFAULT TRUE,
  min_markup NUMERIC(5, 2) DEFAULT 0,
  max_markup NUMERIC(5, 2) DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW (),
  updated_at TIMESTAMPTZ DEFAULT NOW (),

  CONSTRAINT bdi_settings_tenant_unique UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS bdi_settings_tenant_id_idx ON public.bdi_settings (tenant_id);

ALTER TABLE public.bdi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bdi_settings_select" ON public.bdi_settings FOR SELECT
  USING (tenant_id = public.get_current_tenant_id ());

CREATE POLICY "bdi_settings_insert" ON public.bdi_settings FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  );

CREATE POLICY "bdi_settings_update" ON public.bdi_settings FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id ()
    AND public.is_current_user_tenant_admin ()
  )
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

DROP TRIGGER IF EXISTS bdi_settings_updated_at ON public.bdi_settings;

CREATE TRIGGER bdi_settings_updated_at
BEFORE UPDATE ON public.bdi_settings FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at ();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS use_custom_bdi BOOLEAN DEFAULT FALSE;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS custom_tax_rate NUMERIC(5, 2);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS custom_profit_margin NUMERIC(5, 2);

CREATE OR REPLACE FUNCTION public.calculate_selling_price (
  p_cost NUMERIC,
  p_tenant_id UUID,
  p_custom_tax_pct NUMERIC DEFAULT NULL,
  p_custom_profit_pct NUMERIC DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_row public.bdi_settings;
  v_total_tax NUMERIC;
  v_overheads NUMERIC;
  v_profit_pct NUMERIC;
  v_use_compound boolean;
  v_divisor NUMERIC;
  v_mult NUMERIC;
  v_selling NUMERIC;
  v_min_m NUMERIC;
  v_max_m NUMERIC;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN 0::NUMERIC;
  END IF;

  SELECT * INTO v_row
  FROM public.bdi_settings
  WHERE tenant_id = p_tenant_id
  LIMIT 1;

  IF NOT FOUND THEN
    v_row.tax_icms := 0;
    v_row.tax_pis := 0;
    v_row.tax_cofins := 0;
    v_row.tax_ipi := 0;
    v_row.tax_iss := 0;
    v_row.admin_overhead := 15;
    v_row.commercial_overhead := 10;
    v_row.financial_overhead := 5;
    v_row.profit_margin := 20;
    v_row.use_compound_bdi := TRUE;
    v_row.min_markup := 0;
    v_row.max_markup := 100;
  END IF;

  IF p_custom_tax_pct IS NOT NULL THEN
    v_total_tax := p_custom_tax_pct;
  ELSE
    v_total_tax :=
      COALESCE(v_row.tax_icms, 0) + COALESCE(v_row.tax_pis, 0)
      + COALESCE(v_row.tax_cofins, 0) + COALESCE(v_row.tax_ipi, 0)
      + COALESCE(v_row.tax_iss, 0);
  END IF;

  IF p_custom_profit_pct IS NOT NULL THEN
    v_profit_pct := p_custom_profit_pct;
  ELSE
    v_profit_pct := COALESCE(v_row.profit_margin, 0);
  END IF;

  v_overheads :=
    (
      COALESCE(v_row.admin_overhead, 0)
      + COALESCE(v_row.commercial_overhead, 0)
      + COALESCE(v_row.financial_overhead, 0)
    )
    / 100.0;

  v_use_compound := COALESCE(v_row.use_compound_bdi, TRUE);
  v_min_m := COALESCE(v_row.min_markup, 0);
  v_max_m := COALESCE(v_row.max_markup, 0);

  IF v_use_compound THEN
    v_divisor :=
      1::NUMERIC
      - (
        (v_total_tax / 100.0) + v_overheads + (v_profit_pct / 100.0)
      );

    IF v_divisor <= 0 THEN
      v_divisor := 0.01;
    END IF;

    v_selling := p_cost / v_divisor;
  ELSE
    v_mult :=
      1::NUMERIC + (v_total_tax / 100.0) + v_overheads
      + (v_profit_pct / 100.0);

    v_selling := p_cost * v_mult;
  END IF;

  IF v_min_m IS NOT NULL AND v_min_m > 0 THEN
    IF v_selling < p_cost * (1 + v_min_m / 100.0) THEN
      v_selling := p_cost * (1 + v_min_m / 100.0);
    END IF;
  END IF;

  IF v_max_m IS NOT NULL AND v_max_m > 0 THEN
    IF v_selling > p_cost * (1 + v_max_m / 100.0) THEN
      v_selling := p_cost * (1 + v_max_m / 100.0);
    END IF;
  END IF;

  RETURN round(v_selling, 2);
END;
$$;

COMMENT ON FUNCTION public.calculate_selling_price (numeric, uuid, numeric, numeric) IS
'Preço sugerido a partir do custo e configurações BDI do tenant; aceita sobretaxa/margem custom.';
