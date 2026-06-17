"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PcpPurchaseScheduleRow } from "@/modules/pcp/lib/pcp-purchase-schedule";
import { formatPcpDate } from "@/modules/pcp/lib/pcp-order-display";
import { BrDateInput } from "@/shared/ui/br-date-input";

async function fetchSchedule(): Promise<PcpPurchaseScheduleRow[]> {
  const res = await fetch("/api/pcp/purchase-schedule", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    rows?: PcpPurchaseScheduleRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar compras");
  return json.rows ?? [];
}

function poStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "sent":
    case "ordered":
      return "Emitido";
    case "received":
      return "Recebido";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

export function PcpPurchaseSchedulePanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["pcp-purchase-schedule"],
    queryFn: fetchSchedule,
  });

  const followUpMut = useMutation({
    mutationFn: async (args: { id: string; follow_up_date: string | null }) => {
      const res = await fetch("/api/pcp/purchase-schedule", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar follow-up");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pcp-purchase-schedule"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const filtered = (q.data ?? []).filter((row) => {
    const t = search.trim().toLowerCase();
    if (!t) return true;
    return (
      row.po_number.toLowerCase().includes(t) ||
      (row.sales_order_number ?? "").toLowerCase().includes(t) ||
      row.description.toLowerCase().includes(t) ||
      (row.product_code ?? "").toLowerCase().includes(t) ||
      (row.supplier_name ?? "").toLowerCase().includes(t)
    );
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 sm:px-4 py-2 border-b border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          Cronograma de compras (MRP)
        </h2>
        <input
          type="search"
          className="w-full sm:w-72 min-h-[36px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs"
          placeholder="Buscar PC, pedido, produto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {q.isLoading ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar…
        </p>
      ) : q.isError ? (
        <p className="px-4 py-8 text-center text-sm text-red-600">
          {q.error instanceof Error ? q.error.message : "Erro"}
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-slate-500">
          Nenhum item de compra gerado pelo MRP. Execute o MRP nos pedidos
          confirmados para criar PCs de componentes.
        </p>
      ) : (
        <div className="overflow-x-auto min-w-[960px]">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2 font-semibold">Pedido venda</th>
                <th className="px-3 py-2 font-semibold">PC</th>
                <th className="px-3 py-2 font-semibold">Componente</th>
                <th className="px-3 py-2 font-semibold">Fornecedor</th>
                <th className="px-3 py-2 font-semibold text-right">Qtd</th>
                <th className="px-3 py-2 font-semibold">Prev. entrega</th>
                <th className="px-3 py-2 font-semibold">Follow-up</th>
                <th className="px-3 py-2 font-semibold">Status PC</th>
                <th className="px-3 py-2 font-semibold text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-slate-50/80"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.sales_order_id ? (
                      <Link
                        href={`/sales/orders/${row.sales_order_id}`}
                        className="text-[#1B4F72] hover:underline font-mono"
                      >
                        {row.sales_order_number ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    <Link
                      href={`/purchasing/orders/${row.purchase_order_id}`}
                      className="text-[#1B4F72] hover:underline"
                    >
                      {row.po_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-[12rem]">
                    <span className="font-mono text-[10px] text-slate-500 block">
                      {row.product_code}
                    </span>
                    <span className="line-clamp-2">{row.description}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[10rem] truncate">
                    {row.supplier_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.quantity} {row.unit}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatPcpDate(row.expected_delivery)}
                  </td>
                  <td className="px-3 py-2">
                    <BrDateInput
                      variant="compact"
                      className="w-[9.5rem] text-[10px]"
                      value={row.follow_up_date ?? null}
                      onChange={(v) => {
                        if (v !== (row.follow_up_date ?? null)) {
                          followUpMut.mutate({
                            id: row.id,
                            follow_up_date: v,
                          });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px]">
                      {poStatusLabel(row.po_status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/purchasing/orders/${row.purchase_order_id}`}
                      className="text-[10px] text-[#1B4F72] hover:underline font-medium"
                    >
                      {row.po_status === "draft" ? "Emitir / editar PC" : "Ver PC"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
