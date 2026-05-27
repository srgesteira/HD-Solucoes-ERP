"use client";

import { ModuleDashboardPage } from "@/components/dashboard/module-dashboard-page";

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function HrDashboardPage() {
  return (
    <ModuleDashboardPage
      title="Dashboard de RH"
      module="hr"
      apiPath="/api/dashboard/hr/kpis"
      mapData={(d) => [
        {
          title: "Colaboradores activos",
          value: String(d.active_employees ?? 0),
        },
        {
          title: "Turnover",
          value:
            d.turnover_pct != null ? `${d.turnover_pct}%` : "—",
          subtitle: `${d.terminated_in_period ?? 0} desligamento(s) no período`,
        },
        {
          title: "Custo médio / colaborador",
          value: fmtBrl(Number(d.avg_cost_per_employee ?? 0)),
        },
        {
          title: "Folha (estimativa)",
          value: fmtBrl(Number(d.payroll_total_month ?? 0)),
        },
        {
          title: "Horas extras",
          value: String(d.overtime_hours ?? 0),
          subtitle:
            typeof d.overtime_note === "string" ? d.overtime_note : undefined,
        },
      ]}
    />
  );
}
