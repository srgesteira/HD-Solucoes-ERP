"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  FiscalStatusBadge,
  ReadyForInvoiceCompositeBadge,
} from "@/components/fiscal/fiscal-status-badge";
import type { FiscalInvoicingListRow } from "@/modules/faturamento/lib/fiscal-invoicing-list-service";
import { formatFiscalListDate } from "@/modules/faturamento/lib/fiscal-invoicing-list-display";
import { isFiscalConfigured } from "@/modules/fiscal/lib/fiscal-rules-types";
import { cn } from "@/shared/utils/cn";
import { fmtBRL } from "@/shared/utils/format-brl";

type KanbanColumnKey = "fiscal_pending" | "waiting" | "ready";

const COLUMNS: Array<{
  key: KanbanColumnKey;
  label: string;
  color: string;
  hint: string;
}> = [
  {
    key: "fiscal_pending",
    label: "Fiscal a conferir",
    color: "#f59e0b",
    hint: "Conferir impostos → card anda",
  },
  {
    key: "waiting",
    label: "Conferido",
    color: "#0ea5e9",
    hint: "Aguarda liberação do PCP",
  },
  {
    key: "ready",
    label: "Pronto para emissão",
    color: "#10b981",
    hint: "Habilita «Emitir nota» na Expedição",
  },
];

type ApiResponse = {
  data: FiscalInvoicingListRow[];
  pagination: { page: number; limit: number; total: number };
  error?: string;
};

async function fetchColumn(
  tab: KanbanColumnKey,
  search: string
): Promise<ApiResponse> {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("limit", "50");
  params.set("tab", tab);
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/faturamento/fiscal?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar kanban"
    );
  }
  return json;
}

function isUrgent(row: FiscalInvoicingListRow): boolean {
  return (
    row.ready_for_invoice === true &&
    !row.billing_closure &&
    !isFiscalConfigured(row.fiscal_status ?? "pending")
  );
}

function FiscalKanbanCard({ row }: { row: FiscalInvoicingListRow }) {
  const urgent = isUrgent(row);
  return (
    <div
      className={cn(
        "rounded-md border bg-white shadow-sm transition",
        urgent
          ? "border-amber-400 animate-pulse ring-2 ring-amber-300/70"
          : "border-slate-200 hover:border-emerald-600 hover:shadow"
      )}
    >
      <Link
        href={`/faturamento/fiscal/${row.id}`}
        className="block w-full text-left p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-md"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{row.order_number}</p>
          {urgent ? (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-950"
              title="PCP liberou — fiscal ainda não conferiu"
            >
              <AlertTriangle className="h-3 w-3" />
              Urgente
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{row.client_name}</p>
        <p className="text-[11px] text-slate-400 mt-1">
          {formatFiscalListDate(row.order_date)} · {fmtBRL(row.total)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ReadyForInvoiceCompositeBadge
            readyForInvoice={row.ready_for_invoice}
            fiscalStatus={row.fiscal_status ?? "pending"}
          />
          <FiscalStatusBadge status={row.fiscal_status ?? "pending"} />
        </div>
      </Link>
    </div>
  );
}

type Props = {
  search: string;
  enabled?: boolean;
};

export function FiscalOutboundKanban({ search, enabled = true }: Props) {
  const results = useQueries({
    queries: COLUMNS.map((col) => ({
      queryKey: ["fiscal-invoicing-kanban", col.key, search] as const,
      queryFn: () => fetchColumn(col.key, search),
      staleTime: 60_000,
      enabled,
    })),
  });

  const loading = results.some((r) => r.isLoading);
  const firstError = results.find((r) => r.error)?.error;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Kanban de saída — o card <strong>não se arrasta</strong>. Abra a
        conferência e finalize; o PCP liberar produção move para «Pronto para
        emissão», que habilita o botão na Expedição. PCP liberou sem conferência
        fiscal → badge <strong>Urgente</strong>.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar kanban…
        </div>
      ) : null}

      {firstError ? (
        <p className="text-sm text-red-600">
          {firstError instanceof Error
            ? firstError.message
            : "Erro ao carregar kanban."}
        </p>
      ) : null}

      {!loading && !firstError ? (
        <div className="kanban-scroll flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {COLUMNS.map((col, i) => {
            const rows = results[i]?.data?.data ?? [];
            const total = results[i]?.data?.pagination.total ?? rows.length;
            return (
              <div
                key={col.key}
                className="w-[min(100%,280px)] sm:w-72 shrink-0 flex flex-col rounded-lg bg-slate-100/80 border border-slate-200/80 p-3 max-h-[min(70vh,560px)]"
              >
                <div className="flex items-start gap-2 shrink-0 mb-2 pb-2 border-b border-slate-200/80">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: col.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-800 text-sm">
                        {col.label}
                      </h4>
                      <span className="text-xs text-slate-500">{total}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{col.hint}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto kanban-scroll pr-0.5">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhum pedido</p>
                  ) : (
                    rows.map((row) => <FiscalKanbanCard key={row.id} row={row} />)
                  )}
                  {total > rows.length ? (
                    <p className="text-[10px] text-slate-500 text-center pt-1">
                      A mostrar {rows.length} de {total} — use a lista para
                      paginar.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
