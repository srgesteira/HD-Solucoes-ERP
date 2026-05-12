-- Simples Nacional: alíquota DAS na empresa + cálculo de preço coerente com o regime

ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS das_aliquot NUMERIC (5, 2);

COMMENT ON COLUMN public.company_settings.das_aliquot IS 'Alíquota efectiva do DAS (Simples Nacional), em %';

CREATE OR REPLACE FUNCTION public.calculate_selling_price (
  p_cost NUMERIC,
  p_tenant_id UUID,
  p_custom_tax_pct NUMERIC DEFAULT NULL,
  p_custom_profit_pct NUMERIC DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_row public.bdi_settings;
  v_company public.company_settings;
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

  SELECT * INTO v_company
  FROM public.company_settings
  WHERE tenant_id = p_tenant_id
  LIMIT 1;

  IF p_custom_tax_pct IS NOT NULL THEN
    v_total_tax := p_custom_tax_pct;
  ELSIF v_company.tax_regime = 'simples_nacional' THEN
    v_total_tax := COALESCE(v_company.das_aliquot, 0);
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
'Preço sugerido a partir do custo e BDI; em Simples Nacional usa company_settings.das_aliquot como carga fiscal única.';

NOTIFY pgrst, 'reload schema';
