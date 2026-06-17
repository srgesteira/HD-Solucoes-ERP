-- §9 do documento funcional: módulo Transporte / Expedição.
-- Centraliza cargas saindo do almoxarifado: pode ser entrega de pedido
-- de venda, coleta de devolução de venda, ou despacho de devolução de
-- compra. Cada shipment vincula a um documento origem.

CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,

  shipment_number TEXT NOT NULL,
  /* Tipo de origem: define qual coluna FK deve estar preenchida. */
  source_kind TEXT NOT NULL CHECK (
    source_kind IN (
      'sales_order',
      'sales_return',
      'purchase_return',
      'manual'
    )
  ),
  sales_order_id UUID REFERENCES public.sales_orders (id) ON DELETE SET NULL,
  sales_return_id UUID REFERENCES public.sales_returns (id) ON DELETE SET NULL,
  purchase_return_id UUID REFERENCES public.purchase_returns (id) ON DELETE SET NULL,

  /* Direção: outbound = sai do almoxarifado; inbound = recebe (coleta). */
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (
    direction IN ('outbound', 'inbound')
  ),

  /* Endereços: lemos do documento origem mas guardamos snapshot aqui
     porque endereço de cliente pode mudar depois. */
  destination_name TEXT,
  destination_document TEXT,
  destination_address TEXT,

  /* Transporte. */
  carrier_name TEXT,
  carrier_document TEXT,
  tracking_code TEXT,
  freight_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  freight_payer TEXT CHECK (
    freight_payer IS NULL
    OR freight_payer IN ('shipper', 'consignee', 'third_party')
  ),

  scheduled_for DATE,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'prepared' CHECK (
    status IN ('prepared', 'in_transit', 'delivered', 'cancelled')
  ),

  notes TEXT,

  created_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  shipped_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  delivered_by UUID REFERENCES public.user_profiles (id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shipments_tenant_number_uidx UNIQUE (tenant_id, shipment_number)
);

CREATE INDEX IF NOT EXISTS idx_shipments_tenant_status
  ON public.shipments (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_tenant_scheduled
  ON public.shipments (tenant_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_shipments_source
  ON public.shipments (source_kind, sales_order_id, sales_return_id, purchase_return_id);

DROP TRIGGER IF EXISTS set_shipments_updated_at ON public.shipments;
CREATE TRIGGER set_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.shipments IS
  '§9 — módulo Transporte. Cargas saindo (entregas) ou entrando (coletas) do almoxarifado.';
COMMENT ON COLUMN public.shipments.source_kind IS
  'Documento que disparou o despacho. manual = não vinculado.';
COMMENT ON COLUMN public.shipments.direction IS
  'outbound = entrega ao cliente / fornecedor; inbound = coleta de devolução.';

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipments_tenant_select" ON public.shipments;
CREATE POLICY "shipments_tenant_select"
  ON public.shipments FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id ());

DROP POLICY IF EXISTS "shipments_tenant_modify" ON public.shipments;
CREATE POLICY "shipments_tenant_modify"
  ON public.shipments FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id ())
  WITH CHECK (tenant_id = public.get_current_tenant_id ());

NOTIFY pgrst, 'reload schema';
