-- Rejeitada/erro: preferir o registo que já tem número (000002) para reemitir
-- o mesmo sequencial depois de apagar no Bling.
CREATE OR REPLACE FUNCTION public.fn_bling_claim_nfe_emit(
  p_tenant_id UUID,
  p_sales_order_id UUID,
  p_idempotency_key TEXT
)
RETURNS public.nfes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.nfes%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(p_tenant_id::text || ':bling-nfe:' || p_sales_order_id::text)
  );

  SELECT *
    INTO v_row
    FROM public.nfes
   WHERE tenant_id = p_tenant_id
     AND sales_order_id = p_sales_order_id
     AND provider = 'bling'
     AND status <> 'cancelled'
   ORDER BY
     CASE status
       WHEN 'authorized' THEN 0
       WHEN 'processing' THEN 1
       WHEN 'pending' THEN 2
       WHEN 'rejected' THEN 3
       ELSE 4
     END,
     CASE WHEN nfe_number IS NOT NULL AND btrim(nfe_number) <> '' THEN 0 ELSE 1 END,
     created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.nfes (
    tenant_id,
    sales_order_id,
    status,
    provider,
    idempotency_key
  )
  VALUES (
    p_tenant_id,
    p_sales_order_id,
    'pending',
    'bling',
    p_idempotency_key
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
