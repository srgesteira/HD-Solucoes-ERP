"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";
import { formatPcpDate } from "@/modules/pcp/lib/pcp-order-display";
import { cn } from "@/shared/utils/cn";

async function fetchPlanning(): Promise<{ orders: PcpPlanningOrder[] }> {
  const res = await fetch("/api/pcp/planning", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    orders?: PcpPlanningOrder[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
  return { orders: json.orders ?? [] };
}

function riskIcon(risk: string | null | undefined) {
  if (risk === "critical")
    return <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Risco alto" />;
  if (risk === "warning")
    return <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Atenção" />;
  if (risk === "ok")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="OK" />;
  return <span className="text-slate-300">—</span>;
}

export function PcpPurchaseDependenciesPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pcp-planning"],
    queryFn: fetchPlanning,
  });

  const rows = useMemo(() => {
    const out: Array<{
      key: string;
      order_number: string;
      product_name: string;
      pcp_deadline: string | null;
      max_pc: string | null;
      risk: string | null;
    }> = [];
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
    <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-600">
            <th className="px-3 py-2 w-10" />
            <th className="px-3 py-2">Pedido</th>
            <th className="px-3 py-2">Produto (linha)</th>
            <th className="px-3 py-2">Prazo PCP</th>
            <th className="px-3 py-2">Maior PC entrega</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-slate-500 text-sm">
                Nenhuma dependência de compra ligada ao planeamento actual.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-slate-100",
                  row.risk === "critical" && "bg-red-50/60",
                  row.risk === "warning" && "bg-amber-50/40"
                )}
              >
                <td className="px-3 py-2">{riskIcon(row.risk)}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.order_number}</td>
                <td className="px-3 py-2 text-xs">{row.product_name}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {formatPcpDate(row.pcp_deadline)}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap font-medium">
                  {formatPcpDate(row.max_pc)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
