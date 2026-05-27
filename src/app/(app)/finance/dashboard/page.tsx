"use client";

import { ModuleDashboardPage } from "@/components/dashboard/module-dashboard-page";

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function FinanceDashboardPage() {
  return (
    <ModuleDashboardPage
      title="Dashboard Financeiro"
      module="finance"
      apiPath="/api/dashboard/finance/kpis"
      mapData={(d) => [
        {
          title: "Margem líquida",
          value:
            d.net_margin_pct != null ? `${d.net_margin_pct}%` : "—",
          subtitle: "Receita − custo dos itens vendidos",
        },
        {
          title: "DSO (dias)",
          value: d.dso_days != null ? String(d.dso_days) : "—",
          subtitle: "Média pagamento − vencimento (títulos pagos)",
        },
        {
          title: "A receber vencidas",
          value: fmtBrl(Number(d.overdue_receivables_total ?? 0)),
        },
        {
          title: "Fluxo projetado (30d)",
          value: fmtBrl(Number(d.projected_cashflow_30d ?? 0)),
        },
        {
          title: "Clientes inadimplentes",
          value: String(
            Array.isArray(d.top_delinquent_clients)
              ? d.top_delinquent_clients.length
              : 0
          ),
          subtitle: "Top 5 com maior valor vencido",
        },
      ]}
    />
  );
}
