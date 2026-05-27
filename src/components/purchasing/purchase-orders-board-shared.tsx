"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { InlineDateEdit } from "@/components/ui/inline-date-edit";
import {
  computeOrderSituation,
  type PurchaseOrderBoardRow,
  type OrderSituation,
} from "@/lib/purchasing/purchase-orders-board";
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
  const colCount = showActions ? 8 : 7;

  return (
    <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 w-[140px]">
              Pedido
            </th>
            <th className="px-3 py-2.5 min-w-[140px]">Fornecedor</th>
            <th className="px-3 py-2.5 w-[110px]">Data pedido</th>
            <th className="px-3 py-2.5 w-[130px]">Prazo entrega</th>
            <th className="px-3 py-2.5 w-[130px] text-right">Valor total</th>
            <th className="px-3 py-2.5 w-[120px]">Status</th>
            <th className="px-3 py-2.5 w-[110px]">Situação</th>
            {showActions ? (
              <th className="px-3 py-2.5 w-[52px] text-center">Ações</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-3 py-10 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const situation = computeOrderSituation(
                row.status,
                row.expected_delivery
              );
              return (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-slate-50/60"
                >
                  <td className="sticky left-0 z-[1] bg-white px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/purchasing/orders/${row.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {row.po_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-800 truncate max-w-[200px]">
                    {row.supplier_name}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap tabular-nums">
                    {formatDate(row.order_date)}
                  </td>
                  <td className="px-3 py-2">
                    {editableDelivery && onDeliveryChange ? (
                      <InlineDateEdit
                        value={row.expected_delivery}
                        onSave={(v) => onDeliveryChange(row.id, v)}
                      />
                    ) : (
                      <span className="text-xs tabular-nums">
                        {formatDate(row.expected_delivery)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
                    {formatBRL(row.total_value)}
                  </td>
                  <td className="px-3 py-2">{statusBadge(row.status)}</td>
                  <td className="px-3 py-2">{situationBadge(situation)}</td>
                  {showActions ? (
                    <td className="px-2 py-2 text-center">
                      <PurchaseOrderBoardActionsMenu
                        orderId={row.id}
                        poNumber={row.po_number}
                        canPurchasing={canPurchasing}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
