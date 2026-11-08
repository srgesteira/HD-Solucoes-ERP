-- Orçamento enviado cria a oportunidade no CRM automaticamente (e as abertas foram criadas em 08/11/2026).
CREATE OR REPLACE FUNCTION public.trg_quote_create_opportunity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.customer_id IS NOT NULL AND NEW.converted_to_sale_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.quote_id = NEW.id) THEN
    INSERT INTO public.crm_opportunities (tenant_id, customer_id, title, stage, amount, quote_id, sales_rep_id, source)
    VALUES (NEW.tenant_id, NEW.customer_id, 'Orçamento ' || NEW.quote_number, 'proposta', NEW.total, NEW.id, NEW.sales_rep_id, 'orcamento');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_quote_create_opportunity ON public.quotes;
CREATE TRIGGER trg_quote_create_opportunity AFTER INSERT OR UPDATE OF status, customer_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quote_create_opportunity();

INSERT INTO public.crm_opportunities (tenant_id, customer_id, title, stage, amount, quote_id, sales_rep_id, source, created_at)
SELECT q.tenant_id, q.customer_id, 'Orçamento ' || q.quote_number, 'proposta', q.total, q.id, q.sales_rep_id, 'orcamento', q.quote_date
FROM public.quotes q
WHERE q.status = 'sent' AND q.customer_id IS NOT NULL AND q.converted_to_sale_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.quote_id = q.id);
