import { formatShortDate } from "@/shared/utils/date";
import { salesOrderStatusPill } from "@/modules/vendas/lib/sales/sales-order-list-display";

export function formatFiscalListDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

export function nfeStatusLabelPt(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "processing":
      return "Processando";
    case "authorized":
      return "Autorizada";
    case "error":
      return "Erro";
    case "cancelled":
      return "Cancelada";
    default:
      return status ? String(status) : "—";
  }
}

export function nfeStatusPill(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "pending":
    case "processing":
      return {
        label: nfeStatusLabelPt(status),
        className:
          "bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100",
      };
    case "authorized":
      return {
        label: "Autorizada",
        className:
          "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    case "error":
      return {
        label: "Erro",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    case "cancelled":
      return {
        label: "Cancelada",
        className:
          "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300",
      };
    default:
      return {
        label: "Sem NF-e",
        className: "text-slate-400",
      };
  }
}

export function creditStatusPill(status: string | null | undefined): {
  label: string;
  className: string;
} | null {
  if (!status) return null;
  switch (status) {
    case "pending":
      return {
        label: "Crédito pendente",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100",
      };
    case "rejected":
      return {
        label: "Crédito rejeitado",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    case "approved":
      return {
        label: "Crédito OK",
        className:
          "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    default:
      return {
        label: status,
        className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

export { salesOrderStatusPill };
