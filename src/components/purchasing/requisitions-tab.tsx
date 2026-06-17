"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileOutput, Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaLoading,
  CronogramaPanel,
} from "@/shared/ui/cronograma-layout";
import { cn } from "@/shared/utils/cn";
import { formatShortDate } from "@/shared/utils/date";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
import type { PurchaseRequisitionRow } from "@/modules/compras/lib/purchasing-requisitions";
import {
  isMigrationRequiredError,
  REQUISITIONS_MIGRATION_HINT,
} from "@/modules/compras/lib/purchasing-requisitions";
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
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

function requisitionStatusLabel(row: PurchaseRequisitionRow): string {
  if (row.quotation_sent_at) return "Orçamento solicitado";
  return "Pendente";
}

type RequisitionsTabProps = {
  search?: string;
};

export function RequisitionsTab({ search = "" }: RequisitionsTabProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/purchasing/requisitions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao excluir requisição");
    },
    onSuccess: (_data, id) => {
      toast.success("Requisição excluída.");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
    onSettled: () => setDeletingId(null),
  });

  const rows = q.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const searchHint = parseUniversalSearch(search);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.need_date ?? "9999").localeCompare(b.need_date ?? "9999")
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    if (!searchHint.text) return sorted;
    return sorted.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          row.product_name,
          row.product_code,
          row.description,
          row.quantity,
          row.unit,
          row.sales_order_number,
          row.production_order_number,
          row.suggested_supplier_name,
          row.preferred_supplier_name,
          row.need_date,
          requisitionStatusLabel(row),
        ],
        suppliers
          .filter((s) => s.id === row.suggested_supplier_id)
          .map((s) => s.name)
      )
    );
  }, [sorted, searchHint, suppliers]);

  const selectedRows = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)),
    [filtered, selectedIds]
  );

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
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

  const handleDelete = useCallback(
    (row: PurchaseRequisitionRow) => {
      const label = row.product_name ?? row.description;
      if (
        !window.confirm(
          `Excluir a requisição de «${label}»?\n\nUse quando o item já foi comprado noutra requisição ou quando a sugestão MRP estiver duplicada.`
        )
      ) {
        return;
      }
      setDeletingId(row.id);
      deleteMut.mutate(row.id);
    },
    [deleteMut]
  );

  const tableColumns = useMemo((): SortableTableColumn<PurchaseRequisitionRow>[] => {
    return [
      {
        key: "select",
        label: "",
        type: "text",
        width: "w-[3%]",
        sortable: false,
        truncate: false,
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleOne(row.id)}
            aria-label={`Seleccionar ${row.product_name ?? row.description}`}
          />
        ),
      },
      {
        key: "product",
        label: "Produto",
        type: "text",
        width: "w-[20%]",
        accessor: (row) => row.product_name ?? row.description,
        truncate: false,
        render: (row) => (
          <>
            <span className={cn(CRONOGRAMA_TOKENS.cellText, "font-medium text-slate-900")}>
              {row.product_name ?? row.description}
            </span>
            {row.product_code ? (
              <span className="block text-xs text-slate-500 font-mono">
                {row.product_code}
              </span>
            ) : null}
            {row.sales_order_number ? (
              <span className="block text-xs text-slate-500">
                PV {row.sales_order_number}
              </span>
            ) : row.production_order_number ? (
              <span className="block text-xs text-slate-500">
                OP {row.production_order_number}
              </span>
            ) : null}
          </>
        ),
      },
      {
        key: "quantity",
        label: "Qtd",
        type: "number",
        width: "w-[7%]",
        align: "right",
        accessor: (row) => row.quantity,
        truncate: false,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {row.quantity} {row.unit}
          </span>
        ),
      },
      {
        key: "suggested_supplier",
        label: "Fornecedor sugerido",
        type: "text",
        width: "w-[16%]",
        accessor: (row) =>
          suppliers.find((s) => s.id === row.suggested_supplier_id)?.name ?? "",
        truncate: false,
        render: (row) => (
          <select
            className="h-8 w-full max-w-[220px] rounded-md border border-slate-300 bg-white px-2 text-xs"
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
        ),
      },
      {
        key: "need_date",
        label: "Data necessidade",
        type: "date",
        width: "w-[10%]",
        accessor: (row) => row.need_date,
        truncate: false,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {formatDate(row.need_date)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        type: "text",
        width: "w-[11%]",
        accessor: (row) => requisitionStatusLabel(row),
        truncate: false,
        render: (row) => (
          <span
            className={cn(
              CRONOGRAMA_TOKENS.badge,
              row.quotation_sent_at
                ? "bg-blue-50 text-blue-800 ring-blue-200"
                : "bg-amber-50 text-amber-900 ring-amber-200"
            )}
          >
            {requisitionStatusLabel(row)}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Ações",
        type: "text",
        width: "w-[18%]",
        sortable: false,
        align: "right",
        truncate: false,
        render: (row) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={issuingId === row.id || !row.suggested_supplier_id}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs text-red-700 border-red-200 hover:bg-red-50"
              disabled={deletingId === row.id || deleteMut.isPending}
              title="Excluir requisição duplicada ou já atendida noutro PC"
              onClick={() => handleDelete(row)}
            >
              {deletingId === row.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Excluir
            </Button>
          </div>
        ),
      },
    ];
  }, [
    selectedIds,
    suppliers,
    supplierMut.isPending,
    issuingId,
    issueMut,
    quoteMut.isPending,
    deletingId,
    deleteMut.isPending,
    handleDelete,
  ]);

  if (q.isLoading) {
    return <CronogramaLoading message="A carregar requisições…" />;
  }

  if (q.error) {
    const msg = q.error instanceof Error ? q.error.message : "Erro";
    const needsMigration = isMigrationRequiredError(msg);
    if (needsMigration) {
      return (
        <div className="py-8 px-4 text-center space-y-2 max-w-lg mx-auto" role="alert">
          <p className="text-sm text-red-700 whitespace-pre-wrap">{msg}</p>
          <p className="text-xs text-slate-600">{REQUISITIONS_MIGRATION_HINT}</p>
        </div>
      );
    }
    return (
      <CronogramaPanel
        error={
          <CronogramaError message={msg} onRetry={() => void q.refetch()} />
        }
      >
        {null}
      </CronogramaPanel>
    );
  }

  return (
    <CronogramaPanel>
      <RequisitionsBatchActionsBar
        selectedRows={selectedRows}
        onClearSelection={() => setSelectedIds(new Set())}
        onSuccess={invalidate}
      />

      {filtered.length > 0 ? (
        <label className="flex items-center gap-2 text-xs text-slate-600 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Seleccionar todas as requisições"
          />
          Seleccionar todas
          {searchHint.text ? (
            <span className="text-slate-400">
              ({filtered.length} de {sorted.length})
            </span>
          ) : null}
        </label>
      ) : null}

      <SortableTable
        columns={tableColumns}
        data={filtered}
        getRowKey={(row) => row.id}
        emptyMessage={
          searchHint.text
            ? "Nenhuma requisição corresponde à busca."
            : "Sem requisições MRP pendentes."
        }
        tableClassName="text-sm"
      />
    </CronogramaPanel>
  );
}
