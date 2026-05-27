-- Análise de crédito (gate Faturamento → PCP)

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS credit_score TEXT;

COMMENT ON COLUMN public.customers.credit_limit IS 'Limite de crédito aprovado (R$)';
COMMENT ON COLUMN public.customers.credit_score IS 'Score A|B|C|D';

CREATE TABLE IF NOT EXISTS public.credit_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_order_ref UUID NOT NULL,
  sales_order_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  order_total NUMERIC(14,2) NOT NULL,
  customer_credit_limit NUMERIC(14,2),
  customer_open_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  customer_overdue_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  customer_score TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_amount NUMERIC(14,2),
  rejection_reason TEXT,
  observations TEXT,
  analyzed_by UUID,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_analysis_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'partial')
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_analysis_status
  ON public.credit_analysis (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_credit_analysis_order
  ON public.credit_analysis (sales_order_ref);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_analysis_order_unique
  ON public.credit_analysis (tenant_id, sales_order_ref);

CREATE OR REPLACE FUNCTION public.fn_create_credit_analysis()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id UUID;
  v_customer_name TEXT;
  v_credit_limit NUMERIC(14,2);
  v_score TEXT;
  v_open NUMERIC(14,2);
  v_overdue NUMERIC(14,2);
BEGIN
  IF NEW.status = 'confirmed'
     AND (OLD.status IS DISTINCT FROM 'confirmed') THEN

    SELECT q.customer_id INTO v_customer_id
    FROM public.quotes q
    WHERE q.id = NEW.quote_id AND q.tenant_id = NEW.tenant_id;

    IF v_customer_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT c.name, c.credit_limit, c.credit_score
    INTO v_customer_name, v_credit_limit, v_score
    FROM public.customers c
    WHERE c.id = v_customer_id AND c.tenant_id = NEW.tenant_id;

    SELECT COALESCE(SUM(r.current_amount), 0)
    INTO v_open
    FROM public.receivables r
    WHERE r.tenant_id = NEW.tenant_id
      AND r.client_document IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.customers cu
        WHERE cu.id = v_customer_id
          AND cu.document IS NOT NULL
          AND cu.document = r.client_document
      )
      AND r.status IN ('pending', 'partial', 'overdue');

    SELECT COALESCE(SUM(r.current_amount), 0)
    INTO v_overdue
    FROM public.receivables r
    WHERE r.tenant_id = NEW.tenant_id
      AND r.status = 'overdue'
      AND r.client_document IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.customers cu
        WHERE cu.id = v_customer_id
          AND cu.document IS NOT NULL
          AND cu.document = r.client_document
      );

    INSERT INTO public.credit_analysis (
      tenant_id,
      sales_order_ref,
      sales_order_number,
      customer_id,
      customer_name,
      order_total,
      customer_credit_limit,
      customer_open_balance,
      customer_overdue_balance,
      customer_score,
      status
    )
    VALUES (
      NEW.tenant_id,
      NEW.id,
      NEW.order_number,
      v_customer_id,
      COALESCE(v_customer_name, NEW.client_name),
      NEW.total,
      v_credit_limit,
      COALESCE(v_open, 0),
      COALESCE(v_overdue, 0),
      v_score,
      'pending'
    )
    ON CONFLICT (tenant_id, sales_order_ref) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_credit_analysis ON public.sales_orders;
CREATE TRIGGER trg_create_credit_analysis
  AFTER UPDATE OF status ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_create_credit_analysis();

INSERT INTO public.credit_analysis (
  tenant_id, sales_order_ref, sales_order_number, customer_id, customer_name,
  order_total, status, customer_open_balance, customer_overdue_balance
)
SELECT
  so.tenant_id, so.id, so.order_number, q.customer_id, COALESCE(c.name, so.client_name),
  so.total,
  'pending',
  0,
  0
FROM public.sales_orders so
JOIN public.quotes q ON q.id = so.quote_id AND q.tenant_id = so.tenant_id
JOIN public.customers c ON c.id = q.customer_id
WHERE so.status IN ('confirmed', 'in_production')
  AND q.customer_id IS NOT NULL
ON CONFLICT (tenant_id, sales_order_ref) DO NOTHING;
