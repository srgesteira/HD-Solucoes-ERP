"use client";

import { ModuleDashboardPage } from "@/components/dashboard/module-dashboard-page";

export default function ProductionDashboardPage() {
  return (
    <ModuleDashboardPage
      title="Dashboard de Produção"
      module="production"
      apiPath="/api/dashboard/production/kpis"
      mapData={(d) => [
        {
          title: "Lead time médio",
          value:
            d.avg_production_lead_time_days != null
              ? `${d.avg_production_lead_time_days} d`
              : "—",
          subtitle: "Ordens finalizadas no período",
        },
        {
          title: "Ocupação das linhas",
          value:
            d.line_occupancy_pct != null
              ? `${d.line_occupancy_pct}%`
              : "—",
          subtitle:
            typeof d.productivity_note === "string"
              ? d.productivity_note
              : "22 dias × 8h × linhas",
        },
        {
          title: "Ordens em atraso",
          value: String(d.delayed_orders ?? 0),
        },
        {
          title: "Em produção",
          value: String(d.orders_in_production ?? 0),
        },
        {
          title: "Finalizadas (período)",
          value: String(d.orders_finished_period ?? 0),
        },
      ]}
    />
  );
}
