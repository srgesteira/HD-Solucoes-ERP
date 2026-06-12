"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { usePcpPlanningQuery } from "@/hooks/use-pcp-planning";
import { formatPcpDate } from "@/modules/pcp/lib/pcp-order-display";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { cn } from "@/shared/utils/cn";

type DependencyRow = {
  key: string;
  order_number: string;
  product_name: string;
  pcp_deadline: string | null;
  max_pc: string | null;
  risk: string | null;
};

function riskIcon(risk: string | null | undefined) {
  if (risk === "critical")
    return <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Risco alto" />;
  if (risk === "warning")
    return <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Atenção" />;
  if (risk === "ok")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="OK" />;
  return <span className="text-slate-300">—</span>;
}

function riskSortLabel(risk: string | null): string {
  if (risk === "critical") return "Crítico";
  if (risk === "warning") return "Atenção";
  if (risk === "ok") return "OK";
  return "—";
}

export function PcpPurchaseDependenciesPanel() {
  const { data, isLoading, error } = usePcpPlanningQuery();

  const rows = useMemo(() => {
    const out: DependencyRow[] = [];
    for (const ord of data?.orders ?? []) {
      for (const it of ord.items) {
        if (!it.max_purchase_delivery_date && !it.purchase_order_id) continue;
        out.push({
          key: it.id,
          order_number: ord.order_number,
          product_name: it.product_name,
          pcp_deadline: it.pcp_deadline,
          max_pc: it.max_purchase_delivery_date,
          risk: it.purchase_risk,
        });
      }
    }
    return out.sort((a, b) => {
      const rank = (r: string | null) =>
        r === "critical" ? 0 : r === "warning" ? 1 : 2;
      return rank(a.risk) - rank(b.risk);
    });
  }, [data?.orders]);

  const tableColumns = useMemo((): SortableTableColumn<DependencyRow>[] => {
    return [
      {
        key: "risk",
        label: "",
        type: "text",
        width: "w-[5%]",
        sortable: false,
        truncate: false,
        accessor: (row) => riskSortLabel(row.risk),
        render: (row) => riskIcon(row.risk),
      },
      {
        key: "order_number",
        label: "Pedido",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.order_number,
        truncate: false,
        render: (row) => (
          <span className="font-mono text-xs">{row.order_number}</span>
        ),
      },
      {
        key: "product_name",
        label: "Produto (linha)",
        type: "text",
        width: "w-[32%]",
        accessor: (row) => row.product_name,
        render: (row) => <span className="text-xs">{row.product_name}</span>,
      },
      {
        key: "pcp_deadline",
        label: "Prazo PCP",
        type: "date",
        width: "w-[14%]",
        accessor: (row) => row.pcp_deadline,
        truncate: false,
        render: (row) => (
          <span className="text-xs whitespace-nowrap">
            {formatPcpDate(row.pcp_deadline)}
          </span>
        ),
      },
      {
        key: "max_pc",
        label: "Maior PC entrega",
        type: "date",
        width: "w-[20%]",
        accessor: (row) => row.max_pc,
        truncate: false,
        render: (row) => (
          <span className="text-xs whitespace-nowrap font-medium">
            {formatPcpDate(row.max_pc)}
          </span>
        ),
      },
    ];
  }, []);

  if (isLoading) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2 py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar dependências…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 py-4">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );
  }

  return (
    <SortableTable
      columns={tableColumns}
      data={rows}
      getRowKey={(row) => row.key}
      emptyMessage="Nenhuma dependência de compra ligada ao planeamento actual."
      rowClassName={(row) =>
        cn(
          row.risk === "critical" && "bg-red-50/60",
          row.risk === "warning" && "bg-amber-50/40"
        )
      }
    />
  );
}
