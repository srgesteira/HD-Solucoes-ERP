-- Cadastro de cliente completo (fiscal + comercial) e CRM dentro do ERP (nov/2026).
-- Objetivos: (1) impostos certos na NF (indIEDest, DIFAL, CFOP) a partir do cadastro;
-- (2) vendedor responsável para relatórios e comissão; (3) CRM (leads, contatos,
-- oportunidades, atividades) no próprio ERP — o agente lê tudo numa chamada (/api/crm/today).

-- ---------------------------------------------------------------------------
-- 1. Vendedores (Gabriel não precisa ser usuário do sistema)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  user_profile_id UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  commission_base TEXT NOT NULL DEFAULT 'invoiced' CHECK (commission_base IN ('invoiced', 'received')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_reps_tenant_name UNIQUE (tenant_id, name)
);

-- ---------------------------------------------------------------------------
-- 2. Cliente: dados cadastrais, fiscais e comerciais/CRM
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS person_type TEXT NOT NULL DEFAULT 'PJ' CHECK (person_type IN ('PJ', 'PF')),
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_number TEXT,
  ADD COLUMN IF NOT EXISTS address_complement TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state CHAR(2),
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS ibge_city_code TEXT,
  -- Fiscal
  ADD COLUMN IF NOT EXISTS municipal_registration TEXT,
  ADD COLUMN IF NOT EXISTS tax_regime TEXT CHECK (tax_regime IN ('simples', 'mei', 'presumido', 'real', 'pf', 'publico', 'outro')),
  -- indIEDest da NF-e: 1 contribuinte ICMS · 2 contribuinte isento · 9 não contribuinte
  ADD COLUMN IF NOT EXISTS icms_taxpayer SMALLINT CHECK (icms_taxpayer IN (1, 2, 9)),
  ADD COLUMN IF NOT EXISTS final_consumer BOOLEAN,
  ADD COLUMN IF NOT EXISTS suframa TEXT,
  ADD COLUMN IF NOT EXISTS invoice_email TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_notes TEXT,
  -- Comercial
  ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES public.sales_reps (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  -- CRM
  ADD COLUMN IF NOT EXISTS crm_stage TEXT NOT NULL DEFAULT 'cliente'
    CHECK (crm_stage IN ('lead', 'contato', 'qualificado', 'cliente', 'inativo', 'perdido')),
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS lead_score SMALLINT,
  ADD COLUMN IF NOT EXISTS last_contact_at DATE,
  ADD COLUMN IF NOT EXISTS next_contact_at DATE,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_customers_crm_next ON public.customers (tenant_id, next_contact_at) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_customers_crm_stage ON public.customers (tenant_id, crm_stage);
CREATE INDEX IF NOT EXISTS idx_customers_document ON public.customers (tenant_id, document);

COMMENT ON COLUMN public.customers.icms_taxpayer IS 'indIEDest NF-e: 1 contribuinte ICMS, 2 contribuinte isento de IE, 9 não contribuinte.';
COMMENT ON COLUMN public.customers.crm_stage IS 'lead → contato → qualificado → cliente (comprou) · inativo · perdido.';

-- Vendedor no orçamento e no pedido (herdado do cliente se vier vazio)
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES public.sales_reps (id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES public.sales_reps (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.trg_quote_default_sales_rep()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sales_rep_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT c.sales_rep_id INTO NEW.sales_rep_id FROM public.customers c WHERE c.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_quote_default_sales_rep ON public.quotes;
CREATE TRIGGER trg_quote_default_sales_rep BEFORE INSERT OR UPDATE OF customer_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quote_default_sales_rep();

-- Pedido: liga ao cliente (pelo orçamento ou pelo CNPJ) e herda o vendedor
CREATE OR REPLACE FUNCTION public.trg_sales_order_customer_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.quote_id IS NOT NULL THEN
    SELECT q.customer_id, coalesce(NEW.sales_rep_id, q.sales_rep_id) INTO NEW.customer_id, NEW.sales_rep_id
    FROM public.quotes q WHERE q.id = NEW.quote_id;
  END IF;
  IF NEW.customer_id IS NULL AND nullif(regexp_replace(coalesce(NEW.client_document, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    SELECT c.id INTO NEW.customer_id FROM public.customers c
    WHERE c.tenant_id = NEW.tenant_id
      AND regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = regexp_replace(NEW.client_document, '\D', '', 'g')
    LIMIT 1;
  END IF;
  IF NEW.sales_rep_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT c.sales_rep_id INTO NEW.sales_rep_id FROM public.customers c WHERE c.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sales_order_customer_link ON public.sales_orders;
CREATE TRIGGER trg_sales_order_customer_link BEFORE INSERT OR UPDATE OF quote_id, client_document, customer_id ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_sales_order_customer_link();

-- Cliente que fecha pedido vira "cliente" no CRM
CREATE OR REPLACE FUNCTION public.trg_sales_order_crm_stage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.status <> 'cancelled' THEN
    UPDATE public.customers SET crm_stage = 'cliente'
    WHERE id = NEW.customer_id AND crm_stage IN ('lead', 'contato', 'qualificado', 'inativo', 'perdido');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_sales_order_crm_stage ON public.sales_orders;
CREATE TRIGGER trg_sales_order_crm_stage AFTER INSERT OR UPDATE OF customer_id, status ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_sales_order_crm_stage();

-- ---------------------------------------------------------------------------
-- 3. Perfil fiscal calculado (o que a NF precisa, a partir do cadastro). Emitente: SP.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.customer_tax_profile
WITH (security_invoker = true) AS
SELECT
  c.id AS customer_id,
  c.tenant_id,
  c.address_state AS uf,
  coalesce(c.icms_taxpayer,
    CASE
      WHEN c.person_type = 'PF' THEN 9
      WHEN nullif(trim(coalesce(c.state_registration, '')), '') IS NULL THEN 9
      WHEN upper(trim(c.state_registration)) IN ('ISENTO', 'ISENTA') THEN 2
      ELSE 1
    END)::smallint AS ind_ie_dest,
  (c.address_state IS NOT NULL AND c.address_state <> 'SP') AS interestadual,
  coalesce(c.final_consumer,
    c.person_type = 'PF' OR nullif(trim(coalesce(c.state_registration, '')), '') IS NULL
    OR upper(trim(c.state_registration)) IN ('ISENTO', 'ISENTA')) AS consumidor_final,
  -- DIFAL (EC 87/2015): venda interestadual a não contribuinte → recolhido pelo emitente.
  -- Contribuinte (uso/consumo) recolhe ele mesmo: só alerta.
  CASE
    WHEN c.address_state IS NULL THEN 'definir_uf'
    WHEN c.address_state = 'SP' THEN 'nao_se_aplica'
    WHEN coalesce(c.icms_taxpayer, CASE WHEN nullif(trim(coalesce(c.state_registration, '')), '') IS NULL THEN 9 ELSE 1 END) = 1
      THEN 'destinatario_recolhe_se_uso_consumo'
    ELSE 'emitente_recolhe'
  END AS difal,
  CASE
    WHEN c.address_state IS NULL OR c.address_state = 'SP' THEN '5102'
    WHEN coalesce(c.icms_taxpayer, CASE WHEN nullif(trim(coalesce(c.state_registration, '')), '') IS NULL THEN 9 ELSE 1 END) = 1 THEN '6102'
    ELSE '6108'
  END AS cfop_venda_sugerido,
  array_remove(ARRAY[
    CASE WHEN nullif(trim(coalesce(c.document, '')), '') IS NULL THEN 'cnpj_cpf' END,
    CASE WHEN c.address_state IS NULL THEN 'uf' END,
    CASE WHEN c.address_city IS NULL THEN 'cidade' END,
    CASE WHEN c.address_zip IS NULL THEN 'cep' END,
    CASE WHEN c.person_type = 'PJ' AND c.state_registration IS NULL AND c.icms_taxpayer IS NULL THEN 'ie_ou_isento' END,
    CASE WHEN c.tax_regime IS NULL THEN 'regime' END
  ], NULL) AS faltando
FROM public.customers c;

COMMENT ON VIEW public.customer_tax_profile IS
  'Perfil fiscal do cliente para a NF-e (emitente SP, Simples): indIEDest, consumidor final, DIFAL, CFOP sugerido e campos faltando.';

-- ---------------------------------------------------------------------------
-- 4. CRM: contatos, oportunidades, atividades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  linkedin_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_decision_maker BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_customer ON public.crm_contacts (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'novo'
    CHECK (stage IN ('novo', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido')),
  amount NUMERIC(14, 2),
  probability SMALLINT CHECK (probability BETWEEN 0 AND 100),
  expected_close DATE,
  cost_center_id UUID REFERENCES public.cost_centers (id) ON DELETE SET NULL, -- família de interesse
  quote_id UUID REFERENCES public.quotes (id) ON DELETE SET NULL,
  sales_order_id UUID REFERENCES public.sales_orders (id) ON DELETE SET NULL,
  sales_rep_id UUID REFERENCES public.sales_reps (id) ON DELETE SET NULL,
  source TEXT,
  lost_reason TEXT,
  next_action TEXT,
  next_action_at DATE,
  closed_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_opps_stage ON public.crm_opportunities (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_opps_customer ON public.crm_opportunities (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_quote ON public.crm_opportunities (quote_id);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers (id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities (id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('ligacao', 'email', 'whatsapp', 'linkedin', 'visita', 'reuniao', 'proposta', 'nota', 'tarefa')),
  direction TEXT CHECK (direction IN ('saida', 'entrada')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary TEXT NOT NULL,
  outcome TEXT,
  due_at DATE, -- para tarefas futuras
  done BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT, -- 'helder', 'claude', 'gabriel'...
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_activities_has_target CHECK (customer_id IS NOT NULL OR opportunity_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_crm_act_customer ON public.crm_activities (tenant_id, customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_act_due ON public.crm_activities (tenant_id, due_at) WHERE NOT done;

-- Atividade concluída atualiza "último contato" do cliente
CREATE OR REPLACE FUNCTION public.trg_crm_activity_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_customer UUID;
BEGIN
  v_customer := coalesce(NEW.customer_id, (SELECT o.customer_id FROM public.crm_opportunities o WHERE o.id = NEW.opportunity_id));
  IF NEW.done AND NEW.type <> 'nota' AND v_customer IS NOT NULL THEN
    UPDATE public.customers SET last_contact_at = greatest(coalesce(last_contact_at, DATE '1900-01-01'), NEW.occurred_at::date),
      crm_stage = CASE WHEN crm_stage = 'lead' THEN 'contato' ELSE crm_stage END
    WHERE id = v_customer;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_crm_activity_touch ON public.crm_activities;
CREATE TRIGGER trg_crm_activity_touch AFTER INSERT OR UPDATE OF done ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.trg_crm_activity_touch();

-- Oportunidade ligada a orçamento acompanha o orçamento; orçamento aprovado → ganho
CREATE OR REPLACE FUNCTION public.trg_quote_sync_opportunity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.crm_opportunities o SET
    amount = coalesce(NEW.total, o.amount),
    stage = CASE
      WHEN NEW.converted_to_sale_id IS NOT NULL OR NEW.status IN ('approved', 'converted') THEN 'ganho'
      WHEN NEW.status IN ('rejected', 'lost', 'cancelled', 'expired') THEN 'perdido'
      WHEN o.stage IN ('novo', 'qualificado') AND NEW.status IN ('sent', 'enviado') THEN 'proposta'
      ELSE o.stage END,
    sales_order_id = coalesce(NEW.converted_to_sale_id, o.sales_order_id),
    closed_at = CASE WHEN (NEW.converted_to_sale_id IS NOT NULL OR NEW.status IN ('approved', 'converted', 'rejected', 'lost', 'cancelled', 'expired'))
      AND o.closed_at IS NULL THEN current_date ELSE o.closed_at END
  WHERE o.quote_id = NEW.id AND o.stage NOT IN ('ganho', 'perdido');
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_quote_sync_opportunity ON public.quotes;
CREATE TRIGGER trg_quote_sync_opportunity AFTER UPDATE OF status, total, converted_to_sale_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quote_sync_opportunity();

-- ---------------------------------------------------------------------------
-- 5. Agenda do dia do CRM (uma chamada, JSON curto — economia de tokens)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_crm_today(p_tenant UUID, p_date DATE DEFAULT current_date)
RETURNS JSONB LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object(
  'data', p_date,
  'contatos_hoje', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'cliente', coalesce(c.trade_name, c.name), 'etapa', c.crm_stage,
      'quando', c.next_contact_at, 'acao', c.next_action, 'tel', c.phone) ORDER BY c.next_contact_at)
    FROM public.customers c
    WHERE c.tenant_id = p_tenant AND c.is_active AND c.next_contact_at <= p_date), '[]'::jsonb),
  'tarefas', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'cliente', coalesce(c.trade_name, c.name), 'tipo', a.type,
      'resumo', a.summary, 'quando', a.due_at) ORDER BY a.due_at)
    FROM public.crm_activities a LEFT JOIN public.customers c ON c.id = a.customer_id
    WHERE a.tenant_id = p_tenant AND NOT a.done AND a.due_at <= p_date), '[]'::jsonb),
  'oportunidades_paradas', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'cliente', coalesce(c.trade_name, c.name), 'titulo', o.title,
      'etapa', o.stage, 'valor', o.amount, 'dias_sem_contato', p_date - coalesce(c.last_contact_at, o.created_at::date)))
    FROM public.crm_opportunities o JOIN public.customers c ON c.id = o.customer_id
    WHERE o.tenant_id = p_tenant AND o.stage NOT IN ('ganho', 'perdido')
      AND p_date - coalesce(c.last_contact_at, o.created_at::date) >= 7
      AND (o.next_action_at IS NULL OR o.next_action_at <= p_date)), '[]'::jsonb),
  'funil', coalesce((
    SELECT jsonb_object_agg(stage, jsonb_build_object('n', n, 'valor', v)) FROM (
      SELECT stage, count(*) AS n, round(coalesce(sum(amount), 0), 2) AS v
      FROM public.crm_opportunities WHERE tenant_id = p_tenant AND stage NOT IN ('ganho', 'perdido') GROUP BY stage) f), '{}'::jsonb),
  'leads_novos_7d', (SELECT count(*) FROM public.customers WHERE tenant_id = p_tenant AND crm_stage = 'lead' AND created_at >= p_date - 7),
  'cadastro_fiscal_incompleto', (SELECT count(*) FROM public.customer_tax_profile t JOIN public.customers c ON c.id = t.customer_id
    WHERE t.tenant_id = p_tenant AND c.crm_stage = 'cliente' AND c.is_active AND cardinality(t.faltando) > 0)
);
$$;

-- ---------------------------------------------------------------------------
-- 6. Triggers updated_at + RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_reps', 'crm_contacts', 'crm_opportunities'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at ()', 'trg_' || t || '_updated_at', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['sales_reps', 'crm_contacts', 'crm_opportunities', 'crm_activities'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (tenant_id = public.get_current_tenant_id ()) WITH CHECK (tenant_id = public.get_current_tenant_id ())',
      t || '_tenant_all', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Seed: vendedores e ligação dos pedidos existentes ao cadastro (pelo CNPJ)
-- ---------------------------------------------------------------------------
INSERT INTO public.sales_reps (tenant_id, name, commission_pct, commission_base)
SELECT t.id, v.name, v.pct, 'invoiced'
FROM public.tenants t
CROSS JOIN (VALUES ('Helder', 0::numeric), ('Gabriel', 3::numeric)) AS v (name, pct)
ON CONFLICT (tenant_id, name) DO NOTHING;

UPDATE public.sales_orders so SET customer_id = c.id, sales_rep_id = coalesce(so.sales_rep_id, c.sales_rep_id)
FROM public.customers c
WHERE so.customer_id IS NULL AND c.tenant_id = so.tenant_id
  AND nullif(regexp_replace(coalesce(so.client_document, ''), '\D', '', 'g'), '') IS NOT NULL
  AND regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = regexp_replace(so.client_document, '\D', '', 'g');

NOTIFY pgrst, 'reload schema';
