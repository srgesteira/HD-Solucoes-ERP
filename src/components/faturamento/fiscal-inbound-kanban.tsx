"use client";

import Link from "next/link";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { FiscalStatusBadge } from "@/components/fiscal/fiscal-status-badge";
import { Button } from "@/shared/ui/button";
import type { FiscalInboundListRow } from "@/modules/faturamento/lib/fiscal-inbound-list-service";
import {
  FISCAL_INBOUND_LIST_TAB_LABELS,
  type FiscalInboundListTab,
} from "@/modules/faturamento/lib/fiscal-inbound-list-tabs";
import { formatFiscalListDate } from "@/modules/faturamento/lib/fiscal-invoicing-list-display";
import { isFiscalConfigured } from "@/modules/fiscal/lib/fiscal-rules-types";
import { cn } from "@/shared/utils/cn";
import { fmtBRL } from "@/shared/utils/format-brl";

const COLUMNS: Array<{
  key: FiscalInboundListTab;
  color: string;
  hint: string;
}> = [
  {
    key: "to_review",
    color: "#f59e0b",
    hint: "Compras: qtd/valor/frete no PC · Fiscal: aplicar regras",
  },
  {
    key: "ready_to_receive",
    color: "#10b981",
    hint: "Concretizar → estoque + contas a pagar",
  },
  {
    key: "received",
    color: "#64748b",
    hint: "Recebimento concluído",
  },
];

type ApiResponse = {
  data: FiscalInboundListRow[];
  pagination: { page: number; limit: number; total: number };
  error?: string;
};

async function fetchColumn(
  tab: FiscalInboundListTab,
  search: string
): Promise<ApiResponse> {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("limit", "50");
  params.set("tab", tab);
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/faturamento/entrada?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar entrada"
    );
  }
  return json;
}

function InboundCard({
  row,
  onApplied,
  onConcretized,
}: {
  row: FiscalInboundListRow;
  onApplied: () => void;
  onConcretized: () => void;
}) {
  const [busy, setBusy] = useState<"fiscal" | "receive" | null>(null);
  const showApply =
    row.status === "sent" ||
    row.status === "confirmed" ||
    row.status === "partial";
  const fiscalOk = isFiscalConfigured(row.fiscal_status ?? "pending");
  const showConcretize =
    fiscalOk && (row.status === "confirmed" || row.status === "partial");

  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/purchasing/orders/${row.id}`}
            className="text-sm font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
          >
            {row.order_number}
          </Link>
          <FiscalStatusBadge status={row.fiscal_status ?? "pending"} />
        </div>
        <p className="text-xs text-slate-600 line-clamp-2">
          {row.supplier_name ?? "Sem fornecedor"}
        </p>
        <p className="text-[11px] text-slate-400">
          {formatFiscalListDate(row.order_date)} · {fmtBRL(row.total)}
          {row.freight_cost && row.freight_cost > 0
            ? ` · frete ${fmtBRL(row.freight_cost)}`
            : ""}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {showApply ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy != null}
              title="Aplicar motor fiscal (NCM/CFOP/alíquotas)"
              onClick={async () => {
                setBusy("fiscal");
                try {
                  const res = await fetch(
                    `/api/faturamento/entrada/${row.id}/apply-fiscal`,
                    { method: "POST", credentials: "include" }
                  );
                  const json = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    fiscalStatus?: string;
                  };
                  if (!res.ok) {
                    throw new Error(json.error ?? "Erro ao aplicar fiscal");
                  }
                  toast.success(
                    `Fiscal aplicado (${json.fiscalStatus ?? "ok"}).`
                  );
                  onApplied();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "fiscal" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Aplicar fiscal
            </Button>
          ) : null}
          {showConcretize ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              className="h-7 px-2 text-[11px]"
              disabled={busy != null}
              title="Concretizar: entrada de estoque + contas a pagar"
              onClick={async () => {
                if (
                  !confirm(
                    `Concretizar ${row.order_number}? Isto dá entrada no estoque e confirma contas a pagar.`
                  )
                ) {
                  return;
                }
                setBusy("receive");
                try {
                  const res = await fetch(
                    `/api/faturamento/entrada/${row.id}/concretize`,
                    { method: "POST", credentials: "include" }
                  );
                  const json = (await res.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  if (!res.ok) {
                    throw new Error(json.error ?? "Erro ao concretizar");
                  }
                  toast.success("Pedido concretizado.");
                  onConcretized();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "receive" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PackageCheck className="h-3.5 w-3.5" />
              )}
              Concretizar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Props = {
  search: string;
  enabled?: boolean;
};

export function FiscalInboundKanban({ search, enabled = true }: Props) {
  const queryClient = useQueryClient();
  const results = useQueries({
    queries: COLUMNS.map((col) => ({
      queryKey: ["fiscal-inbound-kanban", col.key, search] as const,
      queryFn: () => fetchColumn(col.key, search),
      staleTime: 60_000,
      enabled,
    })),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fiscal-inbound-kanban"] });
  };

  const loading = results.some((r) => r.isLoading);
  const firstError = results.find((r) => r.error)?.error;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Kanban de <strong>entrada</strong> — sem drag. Compras ajusta
        quantidade/valor/frete no PC; Faturamento aplica regras e concreta
        (reusa o receive existente). Separação fina Compras→Fiscal (flag) fica
        para refinement se o dono pedir.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar kanban de entrada…
        </div>
      ) : null}

      {firstError ? (
        <p className="text-sm text-red-600">
          {firstError instanceof Error
            ? firstError.message
            : "Erro ao carregar."}
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
                className={cn(
                  "w-[min(100%,280px)] sm:w-72 shrink-0 flex flex-col rounded-lg bg-slate-100/80 border border-slate-200/80 p-3 max-h-[min(70vh,560px)]"
                )}
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
                        {FISCAL_INBOUND_LIST_TAB_LABELS[col.key]}
                      </h4>
                      <span className="text-xs text-slate-500">{total}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {col.hint}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto kanban-scroll pr-0.5">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhum pedido</p>
                  ) : (
                    rows.map((row) => (
                      <InboundCard
                        key={row.id}
                        row={row}
                        onApplied={invalidate}
                        onConcretized={invalidate}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
