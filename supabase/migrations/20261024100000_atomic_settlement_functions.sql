-- Item #1 da auditoria de atomicidade: baixa de título (receivables/accounts_payable)
-- + gravação do movimento em financial_movements deixam de ser duas escritas
-- desacopladas e passam a ocorrer dentro de uma única função Postgres.
-- Uma função plpgsql roda inteira em uma transação implícita: se o INSERT em
-- financial_movements falhar, o UPDATE do título é revertido junto (nada de
-- "conta paga sem extrato").
--
-- Escopo: apenas o passo de baixa (received_amount / pay_amount). Edição de
-- campos que não mexem em caixa (descrição, vencimento, notas etc.) continua
-- via UPDATE direto nas rotas, sem envolver estas funções.

CREATE OR REPLACE FUNCTION public.fn_settle_receivable(
  p_tenant_id UUID,
  p_receivable_id UUID,
  p_amount NUMERIC,
  p_interest_adjustment NUMERIC,
  p_discount_adjustment NUMERIC,
  p_payment_date DATE,
  p_description TEXT,
  p_reference_id UUID,
  p_created_by UUID
)
RETURNS public.receivables
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.receivables%ROWTYPE;
  v_new_paid NUMERIC;
  v_new_current NUMERIC;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_row
  FROM public.receivables
  WHERE id = p_receivable_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Título não encontrado';
  END IF;

  IF v_row.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'Título encerrado; não permite alteração de valores';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor recebido inválido';
  END IF;

  IF p_amount - v_row.current_amount > 0.01 THEN
    RAISE EXCEPTION 'Valor maior que saldo atual (%).', v_row.current_amount;
  END IF;

  IF COALESCE(p_interest_adjustment, 0) < 0 THEN
    RAISE EXCEPTION 'interest_adjustment inválido';
  END IF;

  IF COALESCE(p_discount_adjustment, 0) < 0 THEN
    RAISE EXCEPTION 'discount_adjustment inválido';
  END IF;

  v_new_paid := ROUND(v_row.paid_amount + p_amount, 2);
  v_new_current := ROUND(
    v_row.current_amount - p_amount
      + COALESCE(p_interest_adjustment, 0)
      - COALESCE(p_discount_adjustment, 0),
    2
  );

  IF v_new_current <= 0.005 THEN
    v_new_current := 0;
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE public.receivables
  SET
    paid_amount = v_new_paid,
    current_amount = v_new_current,
    interest_amount = ROUND(v_row.interest_amount + COALESCE(p_interest_adjustment, 0), 2),
    discount_amount = ROUND(v_row.discount_amount + COALESCE(p_discount_adjustment, 0), 2),
    status = v_new_status,
    payment_date = p_payment_date
  WHERE id = p_receivable_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;

  INSERT INTO public.financial_movements (
    tenant_id, direction, amount, movement_date,
    source_kind, source_id, description, reference_id, created_by
  ) VALUES (
    p_tenant_id, 'in', p_amount, p_payment_date,
    'receivable', p_receivable_id,
    COALESCE(NULLIF(TRIM(p_description), ''), 'Recebimento de conta a receber'),
    p_reference_id, p_created_by
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_settle_receivable(
  UUID, UUID, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT, UUID, UUID
) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_settle_payable(
  p_tenant_id UUID,
  p_payable_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_description TEXT,
  p_reference_id UUID,
  p_created_by UUID
)
RETURNS public.accounts_payable
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.accounts_payable%ROWTYPE;
  v_new_current NUMERIC;
  v_new_status TEXT;
  v_new_payment_date DATE;
BEGIN
  SELECT * INTO v_row
  FROM public.accounts_payable
  WHERE id = p_payable_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor de pagamento inválido';
  END IF;

  v_new_current := ROUND(v_row.current_amount - p_amount, 2);

  IF v_new_current < 0 THEN
    RAISE EXCEPTION 'Valor de pagamento superior ao saldo.';
  END IF;

  IF v_new_current = 0 THEN
    v_new_status := 'paid';
    v_new_payment_date := CURRENT_DATE;
  ELSE
    v_new_status := 'pending';
    v_new_payment_date := v_row.payment_date;
  END IF;

  UPDATE public.accounts_payable
  SET
    current_amount = v_new_current,
    status = v_new_status,
    payment_date = v_new_payment_date
  WHERE id = p_payable_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;

  INSERT INTO public.financial_movements (
    tenant_id, direction, amount, movement_date,
    source_kind, source_id, description, reference_id, created_by
  ) VALUES (
    p_tenant_id, 'out', p_amount, p_payment_date,
    'payable', p_payable_id,
    COALESCE(NULLIF(TRIM(p_description), ''), 'Pagamento de conta a pagar'),
    p_reference_id, p_created_by
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_settle_payable(
  UUID, UUID, NUMERIC, DATE, TEXT, UUID, UUID
) TO service_role;

NOTIFY pgrst, 'reload schema';
