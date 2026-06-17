-- Frente 5: remover tabelas mortas (zero uso no código; rbac_* mantido — RBAC-DECISAO.md).

DROP TRIGGER IF EXISTS trg_goods_receipts_sync_tenant ON public.goods_receipts;
DROP TABLE IF EXISTS public.goods_receipts CASCADE;

DROP TABLE IF EXISTS public.incoming_inspections CASCADE;

DROP TRIGGER IF EXISTS trg_operator_lines_sync_tenant ON public.operator_lines;
DROP TABLE IF EXISTS public.operator_lines CASCADE;

DROP TABLE IF EXISTS public.recurring_expenses CASCADE;
DROP TABLE IF EXISTS public.bi_forecasts CASCADE;
DROP TABLE IF EXISTS public.company_kpis CASCADE;

NOTIFY pgrst, 'reload schema';
