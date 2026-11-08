-- Classificação automática de centro de custo + natureza nos itens de pedido de compra.
-- Roda no banco (gatilho), então vale para TODOS os caminhos que criam item de PC:
-- tela, requisição, MRP, conversão de cotação, API.
--
-- Ordem de decisão (determinística):
--   CENTRO  1) item ligado a PV/OP → família do produto vendido (HD1/HD2/HD3/AC) → centro 1.xx
--           2) o próprio produto comprado é de família de produto (HD1/HD2/HD3/AC)
--           3) regra (produto > fornecedor > prefixo > descrição, por prioridade)
--           4) padrão pela natureza: MC→2.03, FER→2.02, ENG→2.04, OCU→2.01
--   NATUREZA 1) regra (produto > fornecedor > prefixo > descrição)
--            2) padrão pelo prefixo do produto (cost_natures.product_prefix_codes)
-- Item com cost_classified_by = 'manual' nunca é sobrescrito.
-- O que ficar sem centro ou natureza aparece na lista "a classificar".

CREATE OR REPLACE FUNCTION public.fn_cost_family_center(p_tenant UUID, p_product UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT cc.id
  FROM public.products p
  JOIN public.product_prefixes px ON px.id = p.prefix_id
  JOIN public.product_families pf ON pf.id = p.family_id
  JOIN public.cost_centers cc ON cc.tenant_id = p_tenant
    AND cc.kind = 'productive' AND cc.is_active
    AND pf.code = ANY (cc.family_codes)
  WHERE p.id = p_product
    AND px.code IN ('HD1', 'HD2', 'HD3', 'AC')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.trg_po_item_classify()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier UUID;
  v_prefix TEXT;
  v_sold_product UUID;
  v_center UUID;
  v_nature UUID;
  v_by TEXT := 'auto';
  v_nature_code TEXT;
BEGIN
  IF NEW.cost_classified_by = 'manual' THEN
    RETURN NEW;
  END IF;

  SELECT po.supplier_id INTO v_supplier FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;

  IF NEW.product_id IS NOT NULL THEN
    SELECT px.code INTO v_prefix
    FROM public.products p JOIN public.product_prefixes px ON px.id = p.prefix_id
    WHERE p.id = NEW.product_id;
  END IF;

  -- ---- CENTRO 1: produto vendido ligado ao item (PV direto, item de OP, OP) ----
  IF NEW.sales_order_item_id IS NOT NULL THEN
    SELECT soi.product_id INTO v_sold_product FROM public.sales_order_items soi WHERE soi.id = NEW.sales_order_item_id;
    v_center := public.fn_cost_family_center(NEW.tenant_id, v_sold_product);
  END IF;

  IF v_center IS NULL AND COALESCE(NEW.production_order_item_id, NEW.production_item_id) IS NOT NULL THEN
    SELECT COALESCE(soi.product_id, oi.product_id) INTO v_sold_product
    FROM public.order_items oi
    LEFT JOIN public.sales_order_items soi ON soi.id = oi.sales_order_item_id
    WHERE oi.id = COALESCE(NEW.production_order_item_id, NEW.production_item_id);
    v_center := public.fn_cost_family_center(NEW.tenant_id, v_sold_product);
  END IF;

  IF v_center IS NULL AND NEW.production_order_id IS NOT NULL THEN
    SELECT public.fn_cost_family_center(NEW.tenant_id, soi.product_id) INTO v_center
    FROM public.sales_order_items soi
    WHERE soi.production_order_id = NEW.production_order_id
      AND public.fn_cost_family_center(NEW.tenant_id, soi.product_id) IS NOT NULL
    LIMIT 1;
  END IF;

  -- ---- CENTRO 2: o próprio item comprado é produto de família (ex.: revenda HD3) ----
  IF v_center IS NULL AND NEW.product_id IS NOT NULL THEN
    v_center := public.fn_cost_family_center(NEW.tenant_id, NEW.product_id);
  END IF;

  -- ---- NATUREZA 1: regra por produto ----
  SELECT r.cost_nature_id INTO v_nature
  FROM public.cost_classification_rules r
  WHERE r.tenant_id = NEW.tenant_id AND r.is_active AND r.cost_nature_id IS NOT NULL
    AND r.product_id = NEW.product_id
  ORDER BY r.priority LIMIT 1;

  -- ---- Regras (centro e/ou natureza que faltam) ----
  IF v_center IS NULL OR v_nature IS NULL THEN
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT cr.cost_center_id, cr.cost_nature_id
        FROM public.cost_classification_rules cr
        WHERE cr.tenant_id = NEW.tenant_id AND cr.is_active
          AND (
            (cr.product_id IS NOT NULL AND cr.product_id = NEW.product_id)
            OR (cr.supplier_id IS NOT NULL AND cr.supplier_id = v_supplier)
            OR (cr.product_prefix_code IS NOT NULL AND cr.product_prefix_code = v_prefix)
            OR (cr.description_pattern IS NOT NULL AND NEW.description ILIKE cr.description_pattern)
          )
        ORDER BY
          CASE WHEN cr.product_id IS NOT NULL THEN 0
               WHEN cr.supplier_id IS NOT NULL THEN 1
               WHEN cr.product_prefix_code IS NOT NULL THEN 2
               ELSE 3 END,
          cr.priority
      LOOP
        IF v_center IS NULL AND r.cost_center_id IS NOT NULL THEN
          v_center := r.cost_center_id; v_by := 'rule';
        END IF;
        IF v_nature IS NULL AND r.cost_nature_id IS NOT NULL THEN
          v_nature := r.cost_nature_id; v_by := 'rule';
        END IF;
        EXIT WHEN v_center IS NOT NULL AND v_nature IS NOT NULL;
      END LOOP;
    END;
  END IF;

  -- ---- NATUREZA 3: padrão pelo prefixo do produto (só se nenhuma regra explícita decidiu) ----
  IF v_nature IS NULL AND v_prefix IS NOT NULL THEN
    SELECT n.id INTO v_nature FROM public.cost_natures n
    WHERE n.tenant_id = NEW.tenant_id AND n.is_active AND v_prefix = ANY (n.product_prefix_codes)
    ORDER BY n.sort_order LIMIT 1;
  END IF;

  -- ---- CENTRO 4: padrão pela natureza (gastos de apoio sem produto vinculado) ----
  IF v_center IS NULL AND v_nature IS NOT NULL THEN
    SELECT n.code INTO v_nature_code FROM public.cost_natures n WHERE n.id = v_nature;
    SELECT cc.id INTO v_center FROM public.cost_centers cc
    WHERE cc.tenant_id = NEW.tenant_id AND cc.code = CASE v_nature_code
      WHEN 'MC' THEN '2.03' WHEN 'FER' THEN '2.02' WHEN 'ENG' THEN '2.04' WHEN 'OCU' THEN '2.01'
      WHEN 'ADM' THEN '3.01' WHEN 'COM' THEN '3.02' WHEN 'IMP' THEN '3.03' WHEN 'RET' THEN '3.04'
    END;
  END IF;

  NEW.cost_center_id := v_center;
  NEW.cost_nature_id := v_nature;
  NEW.cost_classified_by := CASE WHEN v_center IS NULL AND v_nature IS NULL THEN NULL ELSE v_by END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_item_classify ON public.purchase_order_items;
CREATE TRIGGER trg_po_item_classify
  BEFORE INSERT OR UPDATE OF product_id, description, sales_order_item_id, production_order_item_id,
    production_item_id, production_order_id, cost_classified_by
  ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_item_classify();

-- ---------------------------------------------------------------------------
-- Cabeçalho do PC + contas a pagar do PC herdam a classificação quando todos os
-- itens têm o mesmo centro/natureza (senão ficam NULL e o relatório usa os itens).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_po_rollup_cost(p_po UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_center UUID;
  v_nature UUID;
BEGIN
  SELECT
    CASE WHEN count(DISTINCT cost_center_id) = 1 AND bool_and(cost_center_id IS NOT NULL) THEN min(cost_center_id::text)::uuid END,
    CASE WHEN count(DISTINCT cost_nature_id) = 1 AND bool_and(cost_nature_id IS NOT NULL) THEN min(cost_nature_id::text)::uuid END
  INTO v_center, v_nature
  FROM public.purchase_order_items WHERE purchase_order_id = p_po;

  UPDATE public.purchase_orders SET cost_center_id = v_center, cost_nature_id = v_nature
  WHERE id = p_po AND (cost_center_id IS DISTINCT FROM v_center OR cost_nature_id IS DISTINCT FROM v_nature);

  UPDATE public.accounts_payable SET cost_center_id = v_center, cost_nature_id = v_nature
  WHERE purchase_order_id = p_po AND (cost_center_id IS DISTINCT FROM v_center OR cost_nature_id IS DISTINCT FROM v_nature);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_po_item_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.fn_po_rollup_cost(COALESCE(NEW.purchase_order_id, OLD.purchase_order_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_item_rollup ON public.purchase_order_items;
CREATE TRIGGER trg_po_item_rollup
  AFTER INSERT OR DELETE OR UPDATE OF cost_center_id, cost_nature_id
  ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_item_rollup();

-- Conta a pagar nova de PC já nasce classificada
CREATE OR REPLACE FUNCTION public.trg_ap_inherit_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cost_center_id IS NULL AND NEW.purchase_order_id IS NOT NULL THEN
    SELECT po.cost_center_id, po.cost_nature_id INTO NEW.cost_center_id, NEW.cost_nature_id
    FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ap_inherit_cost ON public.accounts_payable;
CREATE TRIGGER trg_ap_inherit_cost
  BEFORE INSERT ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.trg_ap_inherit_cost();

-- Trocar o fornecedor do PC reclassifica os itens automáticos
CREATE OR REPLACE FUNCTION public.trg_po_supplier_reclassify()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.purchase_order_items
  SET cost_classified_by = cost_classified_by
  WHERE purchase_order_id = NEW.id AND cost_classified_by IS DISTINCT FROM 'manual';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_supplier_reclassify ON public.purchase_orders;
CREATE TRIGGER trg_po_supplier_reclassify
  AFTER UPDATE OF supplier_id ON public.purchase_orders
  FOR EACH ROW WHEN (OLD.supplier_id IS DISTINCT FROM NEW.supplier_id)
  EXECUTE FUNCTION public.trg_po_supplier_reclassify();

-- ---------------------------------------------------------------------------
-- Implantação: classifica os PCs de novembro/2026 em diante (nada antes disso).
-- ---------------------------------------------------------------------------
UPDATE public.purchase_order_items poi
SET cost_classified_by = poi.cost_classified_by
FROM public.purchase_orders po
WHERE po.id = poi.purchase_order_id
  AND po.order_date >= DATE '2026-11-01'
  AND po.status <> 'cancelled';

NOTIFY pgrst, 'reload schema';
