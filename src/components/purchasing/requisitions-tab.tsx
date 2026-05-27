"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileOutput, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { PurchaseRequisitionRow } from "@/lib/purchasing-requisitions";
import {
  isMigrationRequiredError,
  REQUISITIONS_MIGRATION_HINT,
} from "@/lib/purchasing-requisitions";
import {
  requisitionsCountQueryKey,
  requisitionsQueryKey,
} from "@/components/purchasing/purchase-requisitions-panel";
import { RequisitionsBatchActionsBar } from "@/components/purchasing/batch-actions-bar";

async function fetchRequisitions(): Promise<PurchaseRequisitionRow[]> {
  const res = await fetch("/api/purchasing/requisitions", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    rows?: PurchaseRequisitionRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar requisições");
  return json.rows ?? [];
}

async function fetchSuppliers(): Promise<
  Array<{ id: string; name: string }>
> {
  const res = await fetch(
    "/api/purchasing/suppliers?is_active=true&limit=500",
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{ id: string; name: string; legal_name?: string | null }>;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar fornecedores");
  return (json.data ?? []).map((s) => ({
    id: s.id,
    name: s.name?.trim() || s.legal_name?.trim() || s.id,
  }));
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function requisitionStatusLabel(row: PurchaseRequisitionRow): string {
  if (row.quotation_sent_at) return "Orçamento solicitado";
  return "Pendente";
}

export function RequisitionsTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const q = useQuery({ queryKey: requisitionsQueryKey, queryFn: fetchRequisitions });
  const suppliersQ = useQuery({
    queryKey: ["suppliers-active-requisitions"],
    queryFn: fetchSuppliers,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: requisitionsQueryKey });
    void qc.invalidateQueries({ queryKey: requisitionsCountQueryKey });
    void qc.invalidateQueries({ queryKey: ["purchasing-orders-board", "open"] });
  };

  const supplierMut = useMutation({
    mutationFn: async (args: { id: string; suggested_supplier_id: string | null }) => {
      const res = await fetch(`/api/purchasing/requisitions/${args.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggested_supplier_id: args.suggested_supplier_id,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar fornecedor");
    },
    onSuccess: invalidate,
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const issueMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/purchasing/requisitions/${id}/issue`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        purchase_order_id?: string;
        po_number?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao emitir PC");
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        data.po_number
          ? `PC ${data.po_number} criado.`
          : "Pedido de compra criado."
      );
      invalidate();
      setSelectedIds(new Set());
      if (data.purchase_order_id) {
        router.push("/purchasing/orders?tab=open");
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao emitir PC"),
    onSettled: () => setIssuingId(null),
  });

  const quoteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        "/api/purchasing/requisitions/batch/request-quote",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requisition_ids: [id] }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          supplier_name: string;
          item_count: number;
          email_sent: boolean;
          warning?: string | null;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao solicitar orçamento");
      return json.data;
    },
    onSuccess: (data) => {
      if (data?.warning) toast.warning(data.warning);
      if (data) {
        toast.success(
          `Orçamento solicitado para ${data.supplier_name} com ${data.item_count} item(ns).`
        );
      } else {
        toast.success("Orçamento registado.");
      }
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const rows = q.data ?? [];
  const suppliers = suppliersQ.data ?? [];

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.need_date ?? "9999").localeCompare(b.need_date ?? "9999")
      ),
    [rows]
  );

  const selectedRows = useMemo(
    () => sorted.filter((r) => selectedIds.has(r.id)),
    [sorted, selectedIds]
  );

  const allSelected =
    sorted.length > 0 && sorted.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (q.isLoading) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar requisições…
      </p>
    );
  }

  if (q.error) {
    const msg = q.error instanceof Error ? q.error.message : "Erro";
    const needsMigration = isMigrationRequiredError(msg);
    return (
      <div className="py-8 px-4 text-center space-y-2 max-w-lg mx-auto" role="alert">
        <p className="text-sm text-red-700 whitespace-pre-wrap">{msg}</p>
        {needsMigration ? (
          <p className="text-xs text-slate-600">{REQUISITIONS_MIGRATION_HINT}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RequisitionsBatchActionsBar
        selectedRows={selectedRows}
        onClearSelection={() => setSelectedIds(new Set())}
        onSuccess={invalidate}
      />

      <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
        <table className="w-full text-sm min-w-[880px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <th className="px-2 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todas as requisições"
                />
              </th>
              <th className="px-3 py-2.5">Produto</th>
              <th className="px-3 py-2.5 text-right w-20">Qtd</th>
              <th className="px-3 py-2.5 min-w-[160px]">Fornecedor sugerido</th>
              <th className="px-3 py-2.5 w-[120px]">Data necessidade</th>
              <th className="px-3 py-2.5 w-[140px]">Status</th>
              <th className="px-3 py-2.5 w-[200px] text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                  Sem requisições MRP pendentes.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Seleccionar ${row.product_name ?? row.description}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">
                      {row.product_name ?? row.description}
                    </span>
                    {row.sales_order_number ? (
                      <span className="block text-xs text-slate-500">
                        PV {row.sales_order_number}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.quantity} {row.unit}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="h-8 w-full max-w-[200px] rounded-md border border-slate-300 bg-white px-2 text-xs"
                      value={row.suggested_supplier_id ?? ""}
                      disabled={supplierMut.isPending}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        supplierMut.mutate({
                          id: row.id,
                          suggested_supplier_id: v,
                        });
                      }}
                    >
                      <option value="">— Seleccionar —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
                    {formatDate(row.need_date)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                        row.quotation_sent_at
                          ? "bg-blue-50 text-blue-800 ring-blue-200"
                          : "bg-amber-50 text-amber-900 ring-amber-200"
                      )}
                    >
                      {requisitionStatusLabel(row)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={
                          issuingId === row.id ||
                          !row.suggested_supplier_id
                        }
                        title={
                          !row.suggested_supplier_id
                            ? "Defina o fornecedor sugerido"
                            : undefined
                        }
                        onClick={() => {
                          setIssuingId(row.id);
                          issueMut.mutate(row.id);
                        }}
                      >
                        {issuingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileOutput className="h-3.5 w-3.5" />
                        )}
                        Emitir PC
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={quoteMut.isPending || !row.suggested_supplier_id}
                        title={
                          !row.suggested_supplier_id
                            ? "Defina o fornecedor sugerido"
                            : undefined
                        }
                        onClick={() => quoteMut.mutate(row.id)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Solicitar orçamento
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
