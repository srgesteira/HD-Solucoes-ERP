"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { FileOutput, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PurchaseRequisitionRow } from "@/lib/purchasing-requisitions";
import { validateSameSuggestedSupplier } from "@/lib/purchasing/requisition-batch";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

type Props = {
  selectedRows: PurchaseRequisitionRow[];
  onClearSelection: () => void;
  onSuccess: () => void;
};

export function RequisitionsBatchActionsBar({
  selectedRows,
  onClearSelection,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const validation = validateSameSuggestedSupplier(selectedRows);
  const canBatch = validation.ok;

  const issueBulkMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/purchasing/orders/batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisition_ids: ids,
          supplier_id: validation.ok ? validation.supplierId : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { purchase_order_id: string; po_number: string; linked_count: number };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao emitir PC agrupado");
      return json.data!;
    },
    onSuccess: (data) => {
      toast.success(
        `PC ${data.po_number} criado com ${data.linked_count} item(ns).`
      );
      setBulkOpen(false);
      onClearSelection();
      onSuccess();
      router.push("/purchasing/orders?tab=open");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao emitir PC"),
  });

  const quoteBulkMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(
        "/api/purchasing/requisitions/batch/request-quote",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requisition_ids: ids }),
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
      return json.data!;
    },
    onSuccess: (data) => {
      if (data.warning) toast.warning(data.warning);
      toast.success(
        `Orçamento solicitado para ${data.supplier_name} com ${data.item_count} itens.`
      );
      setQuoteOpen(false);
      onClearSelection();
      onSuccess();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao solicitar orçamento"),
  });

  if (selectedRows.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{selectedRows.length}</span>{" "}
          {selectedRows.length === 1 ? "item seleccionado" : "itens seleccionados"}
          {!canBatch ? (
            <span className="block text-xs text-amber-800 mt-0.5">
              {validation.message}
            </span>
          ) : (
            <span className="block text-xs text-slate-500 mt-0.5">
              Fornecedor: {validation.supplierName}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canBatch || quoteBulkMut.isPending}
            onClick={() => setQuoteOpen(true)}
          >
            <Mail className="h-4 w-4" />
            Solicitar orçamento agrupado
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canBatch || issueBulkMut.isPending}
            onClick={() => setBulkOpen(true)}
          >
            <FileOutput className="h-4 w-4" />
            Emitir PC agrupado
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
          >
            Limpar
          </Button>
        </div>
      </div>

      {bulkOpen && canBatch ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
            role="dialog"
            aria-labelledby="bulk-pc-title"
          >
            <h3 id="bulk-pc-title" className="text-lg font-semibold text-slate-900">
              Confirmar PC agrupado
            </h3>
            <p className="text-sm text-slate-600">
              Será criado um único pedido de compra para{" "}
              <strong>{validation.supplierName}</strong> com{" "}
              {selectedRows.length} item(ns):
            </p>
            <ul className="text-sm border border-slate-100 rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
              {selectedRows.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {r.product_name ?? r.description}
                  </span>
                  <span className="tabular-nums text-slate-600 shrink-0">
                    {r.quantity} {r.unit}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={issueBulkMut.isPending}
                onClick={() =>
                  issueBulkMut.mutate(selectedRows.map((r) => r.id))
                }
              >
                {issueBulkMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileOutput className="h-4 w-4" />
                )}
                Confirmar e emitir
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {quoteOpen && canBatch ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
            role="dialog"
            aria-labelledby="bulk-quote-title"
          >
            <h3 id="bulk-quote-title" className="text-lg font-semibold text-slate-900">
              Solicitar orçamento agrupado
            </h3>
            <p className="text-sm text-slate-600">
              Enviar pedido de cotação para{" "}
              <strong>{validation.supplierName}</strong> com{" "}
              {selectedRows.length} item(ns):
            </p>
            <ul className="text-sm border border-slate-100 rounded-md p-2 max-h-48 overflow-y-auto">
              {selectedRows.map((r) => (
                <li
                  key={r.id}
                  className="flex justify-between gap-2 py-1 border-b border-slate-50 last:border-0"
                >
                  <span className="truncate flex-1">
                    {r.product_name ?? r.description}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {r.quantity} {r.unit} · {formatDate(r.need_date)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuoteOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={quoteBulkMut.isPending}
                onClick={() =>
                  quoteBulkMut.mutate(selectedRows.map((r) => r.id))
                }
              >
                {quoteBulkMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Enviar orçamento
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
