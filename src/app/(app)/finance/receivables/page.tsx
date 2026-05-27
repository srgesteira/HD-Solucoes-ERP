"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { usePermissions } from "@/hooks/use-permissions";

type Row = Record<string, unknown>;

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function FinanceReceivablesPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [overdue, setOverdue] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (status !== "all") params.set("status", status);
      if (overdue) params.set("overdue", "1");
      const res = await fetch(`/api/finance/receivables?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        data?: Row[];
        pagination?: { total: number };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setRows(j.data ?? []);
      setTotal(j.pagination?.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, overdue]);

  useEffect(() => {
    if (!permLoading && !can("finance")) {
      toast.error("Sem acesso ao módulo Financeiro.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("finance")) return;
    void load();
  }, [permLoading, can, load]);

  if (permLoading || (!permLoading && !can("finance"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contas a receber</h1>
          <p className="text-sm text-slate-600 mt-1">
            Títulos do tenant. Filtros por estado e vencidos.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          <span className="ml-1">Actualizar</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label htmlFor="st">Status</Label>
            <select
              id="st"
              className="flex h-9 rounded-md border border-slate-300 px-3 text-sm bg-white"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendente</option>
              <option value="partial">Parcial</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => {
                setPage(1);
                setOverdue(e.target.checked);
              }}
            />
            Só vencidos
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-left px-3 py-2">Vencimento</th>
                    <th className="text-left px-3 py-2">Valor</th>
                    <th className="text-left px-3 py-2">Estado</th>
                    <th className="text-left px-3 py-2">Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        Sem registos.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={String(r.id)} className="border-b border-slate-100">
                        <td className="px-3 py-2">{String(r.client_name ?? "—")}</td>
                        <td className="px-3 py-2">{String(r.due_date ?? "")}</td>
                        <td className="px-3 py-2">
                          {fmtBrl(Number(r.current_amount ?? 0))}
                        </td>
                        <td className="px-3 py-2">{String(r.status ?? "")}</td>
                        <td className="px-3 py-2">
                          {r.sales_order_id ? (
                            <Link
                              href={`/sales/orders/${String(r.sales_order_id)}`}
                              className="text-brand-700 hover:underline"
                            >
                              Ver pedido
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {total > 25 ? (
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
