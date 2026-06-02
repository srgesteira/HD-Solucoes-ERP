"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/shared/utils/cn";
import { InlineDateEdit } from "@/shared/ui/inline-date-edit";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import {
  computeOrderSituation,
  type PurchaseOrderBoardRow,
  type OrderSituation,
} from "@/modules/compras/lib/purchasing/purchase-orders-board";
import { PurchaseOrderBoardActionsMenu } from "@/components/purchasing/purchase-order-board-actions-menu";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  confirmed: "Confirmado",
  partial: "Parcial",
  received: "Recebido",
  cancelled: "Cancelado",
};

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status;
  const cls =
    status === "received"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "cancelled"
        ? "bg-slate-100 text-slate-600 ring-slate-300"
        : status === "partial"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : status === "confirmed" || status === "sent"
            ? "bg-blue-50 text-blue-800 ring-blue-200"
            : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 whitespace-nowrap",
        cls
      )}
    >
      {label}
    </span>
  );
}

function situationBadge(situation: OrderSituation) {
  if (situation === "late") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
        <span aria-hidden>🔴</span> Atrasado
      </span>
    );
  }
  if (situation === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
        <span aria-hidden>🔵</span> Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
      <span aria-hidden>🟢</span> No prazo
    </span>
  );
}

function situationSortLabel(situation: OrderSituation): string {
  if (situation === "late") return "Atrasado";
  if (situation === "pending") return "Pendente";
  return "No prazo";
}

type Props = {
  rows: PurchaseOrderBoardRow[];
  editableDelivery: boolean;
  onDeliveryChange?: (orderId: string, date: string | null) => Promise<void>;
  emptyMessage?: string;
  showActions?: boolean;
  canPurchasing?: boolean;
};

export function PurchaseOrdersBoardTable({
  rows,
  editableDelivery,
  onDeliveryChange,
  emptyMessage = "Nenhum pedido encontrado.",
  showActions = true,
  canPurchasing = false,
}: Props) {
  const tableColumns = useMemo((): SortableTableColumn<PurchaseOrderBoardRow>[] => {
    const cols: SortableTableColumn<PurchaseOrderBoardRow>[] = [
      {
        key: "po_number",
        label: "Pedido",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.po_number,
        truncate: false,
        render: (row) => (
          <Link
            href={`/purchasing/orders/${row.id}`}
            className="font-mono text-xs text-brand-700 hover:underline"
          >
            {row.po_number}
          </Link>
        ),
      },
      {
        key: "supplier_name",
        label: "Fornecedor",
        type: "text",
        width: "w-[18%]",
        accessor: (row) => row.supplier_name,
        render: (row) => (
          <span className="text-xs text-slate-800">{row.supplier_name}</span>
        ),
      },
      {
        key: "order_date",
        label: "Data pedido",
        type: "date",
        width: "w-[11%]",
        accessor: (row) => row.order_date,
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums whitespace-nowrap">
            {formatDate(row.order_date)}
          </span>
        ),
      },
      {
        key: "expected_delivery",
        label: "Prazo entrega",
        type: "date",
        width: "w-[13%]",
        accessor: (row) => row.expected_delivery,
        truncate: false,
        render: (row) =>
          editableDelivery && onDeliveryChange ? (
            <InlineDateEdit
              value={row.expected_delivery}
              onSave={(v) => onDeliveryChange(row.id, v)}
            />
          ) : (
            <span className="text-xs tabular-nums whitespace-nowrap">
              {formatDate(row.expected_delivery)}
            </span>
          ),
      },
      {
        key: "total_value",
        label: "Valor total",
        type: "number",
        width: "w-[12%]",
        align: "right",
        accessor: (row) => row.total_value,
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {formatBRL(row.total_value)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => STATUS_LABELS[row.status] ?? row.status,
        truncate: false,
        render: (row) => statusBadge(row.status),
      },
      {
        key: "situation",
        label: "Situação",
        type: "text",
        width: "w-[12%]",
        accessor: (row) =>
          situationSortLabel(
            computeOrderSituation(row.status, row.expected_delivery)
          ),
        truncate: false,
        render: (row) =>
          situationBadge(
            computeOrderSituation(row.status, row.expected_delivery)
          ),
      },
    ];
    return cols;
  }, [editableDelivery, onDeliveryChange]);

  return (
    <SortableTable
      columns={tableColumns}
      data={rows}
      getRowKey={(row) => row.id}
      emptyMessage={emptyMessage}
      actionsColumn={
        showActions
          ? {
              label: "Ações",
              width: "w-[5rem]",
              render: (row) => (
                <PurchaseOrderBoardActionsMenu
                  orderId={row.id}
                  poNumber={row.po_number}
                  canPurchasing={canPurchasing}
                />
              ),
            }
          : undefined
      }
    />
  );
}
