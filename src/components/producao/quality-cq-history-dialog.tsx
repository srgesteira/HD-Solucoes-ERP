"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatApontamentoDateTime } from "@/modules/producao/lib/line-apontamento";
import type { QualityFinishBlockHistoryEntry } from "@/modules/producao/lib/quality-finish-blocks";

type Props = {
  open: boolean;
  orderItemId: string | null;
  itemLabel: string;
  onClose: () => void;
};

async function fetchHistory(orderItemId: string) {
  const res = await fetch(
    `/api/production/quality-control/history?order_item_id=${encodeURIComponent(orderItemId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    summary?: {
      history: QualityFinishBlockHistoryEntry[];
      released_count: number;
      active: { block_reason: string } | null;
    };
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar histórico");
  return json.summary ?? { history: [], released_count: 0, active: null };
}

export function QualityCqHistoryDialog({
  open,
  orderItemId,
  itemLabel,
  onClose,
}: Props) {
  const historyQ = useQuery({
    queryKey: ["cq-finish-history", orderItemId],
    queryFn: () => fetchHistory(orderItemId!),
    enabled: open && Boolean(orderItemId),
  });

  if (!open) return null;

  const history = historyQ.data?.history ?? [];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
        <h3 className="text-lg font-semibold text-slate-900">
          Histórico de bloqueios CQ
        </h3>
        <p className="text-sm text-slate-600 truncate" title={itemLabel}>
          {itemLabel}
        </p>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
          {historyQ.isLoading ? (
            <div className="flex items-center gap-2 text-slate-600 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar…
            </div>
          ) : historyQ.error ? (
            <p className="text-sm text-red-600 text-center py-4">
              {historyQ.error instanceof Error
                ? historyQ.error.message
                : "Erro"}
            </p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Nenhum registo de bloqueio para este item.
            </p>
          ) : (
            history.map((entry, i) => {
              const isActive = entry.released_at == null;
              return (
                <div
                  key={entry.id}
                  className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
                    isActive
                      ? "border-amber-300 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="font-semibold text-slate-800">
                    #{history.length - i}
                    {isActive ? " — Bloqueio activo" : " — Liberado"}
                  </p>
                  <p>
                    <span className="text-slate-500">Bloqueado:</span>{" "}
                    {formatApontamentoDateTime(entry.blocked_at)}
                  </p>
                  <p className="text-slate-800">
                    <span className="text-slate-500">Motivo:</span>{" "}
                    {entry.block_reason}
                  </p>
                  {entry.released_at ? (
                    <>
                      <p>
                        <span className="text-slate-500">Liberado:</span>{" "}
                        {formatApontamentoDateTime(entry.released_at)}
                      </p>
                      <p className="text-slate-800">
                        <span className="text-slate-500">Ação tomada:</span>{" "}
                        {entry.release_action ?? "—"}
                      </p>
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
