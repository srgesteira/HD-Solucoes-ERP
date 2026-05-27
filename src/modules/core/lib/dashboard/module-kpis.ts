import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export type DashboardKpiItem = {
  key: string;
  label: string;
  value: string | number;
};

export type DashboardKpiResponse = {
  module: string;
  timestamp: string;
  kpis: DashboardKpiItem[];
  alerts: { level: "warning" | "info"; message: string }[];
};

export function buildDashboardPayload(
  module: string,
  kpis: DashboardKpiItem[],
  alerts: DashboardKpiResponse["alerts"] = []
): DashboardKpiResponse {
  return {
    module,
    timestamp: new Date().toISOString(),
    kpis,
    alerts,
  };
}

export async function getFaturamentoKpis(
  tenantId: string
): Promise<DashboardKpiResponse> {
  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { count: pendingCredit } = await db
    .from("credit_analysis")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  const alerts =
    (pendingCredit ?? 0) > 0
      ? [
          {
            level: "warning" as const,
            message: `${pendingCredit} análise(s) de crédito pendente(s)`,
          },
        ]
      : [];

  return buildDashboardPayload(
    "faturamento",
    [
      {
        key: "pending_credit",
        label: "Análises pendentes",
        value: pendingCredit ?? 0,
      },
    ],
    alerts
  );
}

export async function getVendasKpis(
  tenantId: string
): Promise<DashboardKpiResponse> {
  const admin = createSupabaseAdminClient();
  const { count: openQuotes } = await admin
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["draft", "sent"]);

  const { count: openOrders } = await admin
    .from("sales_orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "confirmed", "in_production"]);

  return buildDashboardPayload("vendas", [
    { key: "open_quotes", label: "Orçamentos em aberto", value: openQuotes ?? 0 },
    { key: "open_orders", label: "Pedidos activos", value: openOrders ?? 0 },
  ]);
}

export async function getComprasKpis(
  tenantId: string
): Promise<DashboardKpiResponse> {
  const admin = createSupabaseAdminClient();
  const { count: openPo } = await admin
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["open", "partial", "sent"]);

  return buildDashboardPayload("compras", [
    { key: "open_po", label: "Pedidos de compra abertos", value: openPo ?? 0 },
  ]);
}

const KPI_FETCHERS: Record<
  string,
  (tenantId: string) => Promise<DashboardKpiResponse>
> = {
  vendas: getVendasKpis,
  compras: getComprasKpis,
  faturamento: getFaturamentoKpis,
  pcp: async (tenantId) =>
    buildDashboardPayload("pcp", [
      {
        key: "planning",
        label: "Planeamento PCP",
        value: "Ver módulo",
      },
    ]),
  producao: async (tenantId) => {
    const admin = createSupabaseAdminClient();
    const { count } = await admin
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "completed");
    return buildDashboardPayload("producao", [
      { key: "active_op", label: "OPs activas", value: count ?? 0 },
    ]);
  },
  rh: async () =>
    buildDashboardPayload("rh", [
      { key: "hr", label: "Colaboradores", value: "Ver módulo" },
    ]),
  boards: async () =>
    buildDashboardPayload("boards", [
      { key: "tasks", label: "Quadros", value: "Ver Tarefas" },
    ]),
  core: async () =>
    buildDashboardPayload("core", [
      { key: "settings", label: "Configurações", value: "—" },
    ]),
};

export async function getModuleKpis(
  moduleKey: string,
  tenantId: string
): Promise<DashboardKpiResponse | null> {
  const fn = KPI_FETCHERS[moduleKey];
  if (!fn) return null;
  return fn(tenantId);
}

export const KPI_MODULE_KEYS = Object.keys(KPI_FETCHERS);
