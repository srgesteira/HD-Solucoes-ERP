-- Reforço idempotente §14: a migração 20260925110000 listou 'payables' (nome
-- incorreto — a tabela física é accounts_payable) e ainda não cobria as
-- novas tabelas do fluxo reverso (sales_returns/purchase_returns) nem de
-- transporte (shipments). Aplicamos o trigger nas tabelas corretas aqui,
-- tornando a configuração final independente de quem rodou primeiro.

DO $$
DECLARE
  t TEXT;
  watched TEXT[] := ARRAY[
    'quotes',
    'sales_orders',
    'sales_order_items',
    'purchase_orders',
    'purchase_order_items',
    'production_orders',
    'customers',
    'suppliers',
    'products',
    'fiscal_rules',
    'accounts_payable',
    'receivables',
    'inventory_movements',
    'sales_returns',
    'purchase_returns',
    'shipments'
  ];
BEGIN
  -- 1. Remove trigger antigo apontando para 'payables' (se a tabela legado existir).
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payables'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_log_payables ON public.payables';
  END IF;

  -- 2. (Re)aplica trigger em todas as tabelas relevantes.
  FOREACH t IN ARRAY watched LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_audit_log_%I ON public.%I',
        t, t
      );
      EXECUTE format(
        'CREATE TRIGGER trg_audit_log_%I
          AFTER INSERT OR UPDATE OR DELETE ON public.%I
          FOR EACH ROW EXECUTE FUNCTION public.audit_log_record_change()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
