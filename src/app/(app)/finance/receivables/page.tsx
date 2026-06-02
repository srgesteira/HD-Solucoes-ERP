"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { usePermissions } from "@/hooks/use-permissions";

type Row = Record<string, unknown>;

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  cancelled: "Cancelado",
};

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

  const tableColumns = useMemo((): SortableTableColumn<Row>[] => {
    return [
      {
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[24%]",
        accessor: (row) => String(row.client_name ?? ""),
        render: (row) => (
          <span>{String(row.client_name ?? "—")}</span>
        ),
      },
      {
        key: "due_date",
        label: "Vencimento",
        type: "date",
        width: "w-[14%]",
        accessor: (row) => row.due_date,
        truncate: false,
        render: (row) => (
          <span className="whitespace-nowrap">{String(row.due_date ?? "")}</span>
        ),
      },
      {
        key: "current_amount",
        label: "Valor",
        type: "number",
        width: "w-[14%]",
        accessor: (row) => Number(row.current_amount ?? 0),
        truncate: false,
        render: (row) => (
          <span>{fmtBrl(Number(row.current_amount ?? 0))}</span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        type: "text",
        width: "w-[14%]",
        accessor: (row) =>
          RECEIVABLE_STATUS_LABELS[String(row.status ?? "")] ??
          String(row.status ?? ""),
      },
      {
        key: "document",
        label: "Documento",
        type: "text",
        width: "w-[29%]",
        accessor: (row) =>
          row.sales_order_id ? "Ver pedido" : "—",
        truncate: false,
        render: (row) =>
          row.sales_order_id ? (
            <Link
              href={`/sales/orders/${String(row.sales_order_id)}`}
              className="text-brand-700 hover:underline"
            >
              Ver pedido
            </Link>
          ) : (
            "—"
          ),
      },
    ];
  }, []);

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
          <SortableTable
            columns={tableColumns}
            data={rows}
            getRowKey={(row) => String(row.id)}
            isLoading={loading}
            emptyMessage="Sem registos."
          />
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
