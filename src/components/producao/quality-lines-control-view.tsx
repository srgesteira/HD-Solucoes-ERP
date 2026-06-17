"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  pcpPlanningQueryKey,
  usePcpPlanningQuery,
} from "@/hooks/use-pcp-planning";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";
import {
  fetchProductionLines,
  type ProductionLineBrief,
} from "@/modules/producao/lib/production/production-lines-api";
import {
  PcpLinesLegacyPanel,
  type LineRow,
} from "@/components/pcp/pcp-lines-legacy-panel";
import { QualityCqPromptDialog } from "@/components/producao/quality-cq-prompt-dialog";
import { QualityCqHistoryDialog } from "@/components/producao/quality-cq-history-dialog";
import { HvacIntegrityTestDialog } from "@/components/producao/hvac-integrity-test-dialog";
import { AppPage } from "@/shared/ui/app-page";
import { ErrorState, LoadingState } from "@/shared/ui/page-helpers";
import "@/components/pcp/pcp-legacy.css";

type PromptState =
  | { mode: "block"; orderItemId: string; label: string }
  | { mode: "release"; orderItemId: string; label: string }
  | null;

type IntegrityPromptState = {
  orderItemId: string;
  label: string;
  defaultMethod: string | null;
} | null;

export function QualityLinesControlView() {
  const qc = useQueryClient();
  const [selectedLineId, setSelectedLineId] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [integrityPrompt, setIntegrityPrompt] =
    useState<IntegrityPromptState>(null);
  const [history, setHistory] = useState<{
    orderItemId: string;
    label: string;
  } | null>(null);

  const planningQ = usePcpPlanningQuery();

  const linesQ = useQuery({
    queryKey: ["production-lines"],
    queryFn: fetchProductionLines,
  });

  const lines: ProductionLineBrief[] = linesQ.data ?? [];
  const orders = planningQ.data?.orders ?? [];
  const activeLineId = selectedLineId || lines[0]?.id || "";

  useEffect(() => {
    if (!selectedLineId && lines[0]?.id) {
      setSelectedLineId(lines[0].id);
    }
  }, [lines, selectedLineId]);

  const { activeRows, finishedRows } = useMemo(() => {
    const lid = activeLineId;
    const active: LineRow[] = [];
    const finished: LineRow[] = [];
    if (!lid) return { activeRows: active, finishedRows: finished };

    for (const ord of orders) {
      for (const it of ord.items) {
        if (it.line_id !== lid) continue;
        const row: LineRow = {
          ...it,
          client_name: ord.client_name,
          order_number: ord.order_number,
          order_pcp_deadline: ord.pcp_deadline,
          order_delivery_deadline:
            ord.expected_delivery ?? ord.delivery_deadline,
        };
        const done = isOrderItemProductionFinished({
          production_start: it.production_start,
          production_end: it.production_end,
          status: it.production_status,
          completed_at: it.production_completed_at,
          apontamento_start_at: it.apontamento_start_at,
          apontamento_end_at: it.apontamento_end_at,
        });
        if (done) finished.push(row);
        else active.push(row);
      }
    }

    return {
      activeRows: active.sort((a, b) =>
        (a.pcp_deadline ?? "").localeCompare(b.pcp_deadline ?? "")
      ),
      finishedRows: finished.sort((a, b) =>
        (b.production_end ?? b.pcp_deadline ?? "").localeCompare(
          a.production_end ?? a.pcp_deadline ?? ""
        )
      ),
    };
  }, [orders, activeLineId]);

  const lineRows = showFinished ? finishedRows : activeRows;

  const blockMut = useMutation({
    mutationFn: async ({
      order_item_id,
      block_reason,
    }: {
      order_item_id: string;
      block_reason: string;
    }) => {
      const res = await fetch("/api/production/quality-control/block", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_item_id, block_reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao bloquear");
    },
    onSuccess: () => {
      toast.success("Finalização bloqueada pelo CQ.");
      setPrompt(null);
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const releaseMut = useMutation({
    mutationFn: async ({
      order_item_id,
      release_action,
    }: {
      order_item_id: string;
      release_action: string;
    }) => {
      const res = await fetch("/api/production/quality-control/release", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_item_id, release_action }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao liberar");
    },
    onSuccess: () => {
      toast.success("Item liberado pelo CQ.");
      setPrompt(null);
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const integrityMut = useMutation({
    mutationFn: async (payload: {
      order_item_id: string;
      test_method: string;
      test_date: string;
      result: "pass" | "fail";
      leakage_rate: number | null;
      notes: string;
    }) => {
      const res = await fetch("/api/hvac/integrity-tests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao registar teste");
    },
    onSuccess: () => {
      toast.success("Teste de integridade registado.");
      setIntegrityPrompt(null);
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const cqPending = blockMut.isPending || releaseMut.isPending;
  const integrityPending = integrityMut.isPending;

  const findRowLabel = useCallback(
    (orderItemId: string) => {
      const row = [...activeRows, ...finishedRows].find(
        (r) => r.order_item_id === orderItemId
      );
      return row
        ? `${row.order_number} · ${row.product_name}`
        : orderItemId;
    },
    [activeRows, finishedRows]
  );

  const isLoading = planningQ.isLoading || linesQ.isLoading;
  const loadError =
    planningQ.error instanceof Error
      ? planningQ.error
      : linesQ.error instanceof Error
        ? linesQ.error
        : null;

  const matchedLine = lines.find((l) => l.id === activeLineId);
  const panelTitle = matchedLine
    ? `${matchedLine.code} — ${matchedLine.name}`
    : "Linha";

  return (
    <AppPage
      title="Controle de qualidade — Produção"
      description="Bloqueie ou libere a finalização por linha. Registe testes de integridade HVAC (PAO/DOP) quando exigidos na ficha do produto — a expedição do pedido fica bloqueada sem aprovação."
      width="full"
      density="comfortable"
      actions={
        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            void Promise.all([planningQ.refetch(), linesQ.refetch()]).then(
              () => toast.success("Lista actualizada.")
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </button>
      }
    >
      <div className="pcp-legacy-shell space-y-4">
      {isLoading ? (
        <LoadingState label="A carregar linhas e pedidos…" />
      ) : loadError ? (
        <ErrorState message={loadError.message} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
            <p className="text-xs text-slate-600">
              {showFinished
                ? "Itens já finalizados nesta linha (consulta e histórico CQ)."
                : "Fila actual — bloquear ou liberar finalização por item."}
            </p>
            <button
              type="button"
              onClick={() => setShowFinished((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-slate-50"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              {showFinished
                ? "Voltar aos itens em produção"
                : "Ver finalizados nesta linha"}
            </button>
          </div>

          <PcpLinesLegacyPanel
            lines={lines}
            selectedLineId={activeLineId}
            onLineChange={setSelectedLineId}
            panelTitle={
              showFinished
                ? `${panelTitle} — finalizados`
                : panelTitle
            }
            rows={lineRows}
            readOnly={showFinished}
            qualityControlMode
            emptyMessage={
              showFinished
                ? "Nenhum item finalizado nesta linha."
                : "Nenhum item activo nesta linha."
            }
            onProgramDate={() => {}}
            onNotes={() => {}}
            onStartProduction={() => {}}
            onFinishProduction={() => {}}
            apontamentoPending={false}
            cqActionPending={cqPending}
            onBlockFinish={(orderItemId) =>
              setPrompt({
                mode: "block",
                orderItemId,
                label: findRowLabel(orderItemId),
              })
            }
            onReleaseFinish={(orderItemId) =>
              setPrompt({
                mode: "release",
                orderItemId,
                label: findRowLabel(orderItemId),
              })
            }
            onShowCqHistory={(orderItemId, label) =>
              setHistory({ orderItemId, label })
            }
            onRegisterIntegrityTest={(orderItemId, label, defaultMethod) =>
              setIntegrityPrompt({ orderItemId, label, defaultMethod })
            }
            integrityActionPending={integrityPending}
          />
        </>
      )}

      <QualityCqPromptDialog
        open={prompt != null}
        mode={prompt?.mode ?? "block"}
        itemLabel={prompt?.label ?? ""}
        pending={cqPending}
        onClose={() => setPrompt(null)}
        onConfirm={(text) => {
          if (!prompt) return;
          if (prompt.mode === "block") {
            blockMut.mutate({
              order_item_id: prompt.orderItemId,
              block_reason: text,
            });
          } else {
            releaseMut.mutate({
              order_item_id: prompt.orderItemId,
              release_action: text,
            });
          }
        }}
      />

      <QualityCqHistoryDialog
        open={history != null}
        orderItemId={history?.orderItemId ?? null}
        itemLabel={history?.label ?? ""}
        onClose={() => setHistory(null)}
      />

      <HvacIntegrityTestDialog
        open={integrityPrompt != null}
        itemLabel={integrityPrompt?.label ?? ""}
        defaultMethod={integrityPrompt?.defaultMethod ?? null}
        pending={integrityPending}
        onClose={() => setIntegrityPrompt(null)}
        onConfirm={(payload) => {
          if (!integrityPrompt) return;
          integrityMut.mutate({
            order_item_id: integrityPrompt.orderItemId,
            ...payload,
          });
        }}
      />
      </div>
    </AppPage>
  );
}
