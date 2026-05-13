"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PcpOrderPlanningRow } from "@/lib/pcp-planning";
import { cn } from "@/lib/utils/cn";

async function fetchPlanning(): Promise<{ orders: PcpOrderPlanningRow[] }> {
  const res = await fetch("/api/pcp/planning", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    orders?: PcpOrderPlanningRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar planeamento");
  }
  return { orders: Array.isArray(json.orders) ? json.orders : [] };
}

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  return d;
}

export default function PcpPlanningPage() {
  const q = useQuery({
    queryKey: ["pcp-planning"],
    queryFn: fetchPlanning,
  });

  const orders = q.data?.orders ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Planeamento PCP
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Pedidos confirmados ou em produção: prazos do cliente, PCP no pedido,
            OP por linha e maior prazo previsto nas compras ligadas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={q.isFetching}
          onClick={() => {
            void q.refetch().then(() => toast.success("Lista actualizada."));
          }}
        >
          {q.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-8 text-sm text-red-600">
            {q.error instanceof Error ? q.error.message : "Erro"}
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-slate-600 text-center">
            Nenhum pedido de venda em estado confirmado ou em produção.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((ord) => (
            <Card key={ord.sales_order_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/sales/orders/${ord.sales_order_id}`}
                    className="text-brand-700 underline dark:text-brand-400 font-mono text-sm"
                  >
                    {ord.order_number}
                  </Link>
                  <span className="font-normal text-slate-600 dark:text-slate-400">
                    {ord.client_name}
                  </span>
                  <span className="text-xs font-normal uppercase text-slate-500">
                    {ord.status}
                  </span>
                </CardTitle>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Cliente (entrega):
                    </span>{" "}
                    {fmt(ord.expected_delivery)}
                  </span>
                  <span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      PCP (pedido):
                    </span>{" "}
                    {fmt(ord.pcp_deadline)}
                  </span>
                  <span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Data pedido:
                    </span>{" "}
                    {fmt(ord.order_date)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                  <table className="w-full text-xs min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                        <th className="px-2 py-1.5 text-left font-medium">#</th>
                        <th className="px-2 py-1.5 text-left font-medium">Linha</th>
                        <th className="px-2 py-1.5 text-left font-medium">OP</th>
                        <th className="px-2 py-1.5 text-left font-medium">PCP OP</th>
                        <th className="px-2 py-1.5 text-left font-medium">Entrega OP</th>
                        <th className="px-2 py-1.5 text-left font-medium">Fim prod.</th>
                        <th className="px-2 py-1.5 text-left font-medium">Máx. compras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ord.lines.map((ln) => (
                        <tr
                          key={ln.sales_order_item_id}
                          className="border-b border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-2 py-1.5 tabular-nums">{ln.line_number}</td>
                          <td className="px-2 py-1.5 max-w-[14rem]">
                            <span className="line-clamp-2">{ln.description}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            {ln.production_order_id && ln.op_number ? (
                              <Link
                                href={`/production/orders/${ln.production_order_id}`}
                                className="text-brand-700 underline dark:text-brand-400 font-mono"
                              >
                                {ln.op_number}
                              </Link>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400">
                                Sem OP
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {fmt(ln.op_pcp_deadline)}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {fmt(ln.op_delivery_deadline)}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1.5 tabular-nums",
                              ln.op_production_deadline ? "font-medium" : ""
                            )}
                          >
                            {fmt(ln.op_production_deadline)}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {fmt(ln.max_purchase_expected)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
