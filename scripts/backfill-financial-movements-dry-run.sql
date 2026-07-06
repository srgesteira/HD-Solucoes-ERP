-- Dry-run: linhas que o backfill geraria (sem INSERT).
-- Exclui títulos que já têm movimento em financial_movements.

-- Contas a pagar pagas (1 linha por título; amount = original_amount)
SELECT
  ap.tenant_id,
  'out'::text AS direction,
  ap.original_amount AS amount,
  ap.payment_date AS movement_date,
  'payable'::text AS source_kind,
  ap.id AS source_id,
  ap.purchase_order_id AS reference_id,
  COALESCE(NULLIF(TRIM(ap.description), ''), 'Pagamento de conta a pagar') AS description
FROM public.accounts_payable ap
WHERE ap.status = 'paid'
  AND ap.payment_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_movements fm
    WHERE fm.tenant_id = ap.tenant_id
      AND fm.source_kind = 'payable'
      AND fm.source_id = ap.id
  );

-- Contas a receber pagas/parciais (1 linha; amount = paid_amount acumulado)
SELECT
  r.tenant_id,
  'in'::text AS direction,
  r.paid_amount AS amount,
  r.payment_date AS movement_date,
  'receivable'::text AS source_kind,
  r.id AS source_id,
  r.sales_order_id AS reference_id,
  COALESCE(
    NULLIF(TRIM(r.description), ''),
    CASE
      WHEN NULLIF(TRIM(r.client_name), '') IS NOT NULL
        THEN 'Recebimento — ' || TRIM(r.client_name)
      ELSE 'Recebimento de conta a receber'
    END
  ) AS description
FROM public.receivables r
WHERE r.status IN ('paid', 'partial')
  AND r.payment_date IS NOT NULL
  AND r.paid_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_movements fm
    WHERE fm.tenant_id = r.tenant_id
      AND fm.source_kind = 'receivable'
      AND fm.source_id = r.id
  );

-- Totais
SELECT
  (SELECT COUNT(*)
   FROM public.accounts_payable ap
   WHERE ap.status = 'paid'
     AND ap.payment_date IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_movements fm
       WHERE fm.tenant_id = ap.tenant_id
         AND fm.source_kind = 'payable'
         AND fm.source_id = ap.id
     )) AS payables_to_backfill,
  (SELECT COUNT(*)
   FROM public.receivables r
   WHERE r.status IN ('paid', 'partial')
     AND r.payment_date IS NOT NULL
     AND r.paid_amount > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_movements fm
       WHERE fm.tenant_id = r.tenant_id
         AND fm.source_kind = 'receivable'
         AND fm.source_id = r.id
     )) AS receivables_to_backfill;
