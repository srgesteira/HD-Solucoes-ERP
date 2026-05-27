-- Garantir que o código técnico só é gerado em INSERT (nunca em UPDATE).

DROP TRIGGER IF EXISTS trigger_auto_generate_technical_code ON public.products;

CREATE TRIGGER trigger_auto_generate_technical_code
BEFORE INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_technical_code ();

NOTIFY pgrst, 'reload schema';
