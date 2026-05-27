"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";
import {
  fetchProductionLines,
  type ProductionLineBrief,
} from "@/modules/producao/lib/production/production-lines-api";
import {
  PcpLinesLegacyPanel,
  type LineRow,
} from "@/components/pcp/pcp-lines-legacy-panel";
import "@/components/pcp/pcp-legacy.css";
import {
  ProductionScheduleConflictDialog,
  type ProductionScheduleConflict,
} from "@/components/pcp/production-schedule-conflict-dialog";

async function fetchPlanning(): Promise<{ orders: PcpPlanningOrder[] }> {
  const res = await fetch("/api/pcp/planning", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    orders?: PcpPlanningOrder[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar planeamento");
  return { orders: Array.isArray(json.orders) ? json.orders : [] };
}

type Props = {
  /** Sem cabeçalho de página (uso na aba do PCP). */
  embedded?: boolean;
  /** Linha fixa — oculta o filtro e mostra só itens desta linha. */
  fixedLineId?: string;
  /** Rótulo da linha (código — nome) para título. */
  lineLabel?: string;
};

export function PcpLinesPlanningView({
  embedded = false,
  fixedLineId,
  lineLabel,
}: Props) {
  const qc = useQueryClient();
  const [selectedLineId, setSelectedLineId] = useState(fixedLineId ?? "");
  const [scheduleConflict, setScheduleConflict] = useState<{
    orderItemId: string;
    field: "production_start" | "production_end";
    value: string | null;
    conflict: ProductionScheduleConflict;
  } | null>(null);

  const planningQ = useQuery({
    queryKey: ["pcp-planning"],
    queryFn: fetchPlanning,
  });

  const linesQ = useQuery({
    queryKey: ["production-lines"],
    queryFn: fetchProductionLines,
    enabled: !fixedLineId,
  });

  const lines: ProductionLineBrief[] = linesQ.data ?? [];
  const orders = planningQ.data?.orders ?? [];
  const activeLineId =
    fixedLineId ?? (selectedLineId || lines[0]?.id || "");

  useEffect(() => {
    if (fixedLineId) {
      setSelectedLineId(fixedLineId);
      return;
    }
    if (!selectedLineId && lines[0]?.id) {
      setSelectedLineId(lines[0].id);
    }
  }, [fixedLineId, lines, selectedLineId]);

  const lineRows: LineRow[] = useMemo(() => {
    const lid = activeLineId;
    if (!lid) return [];
    const rows: LineRow[] = [];
    for (const ord of orders) {
      for (const it of ord.items) {
        if (it.line_id !== lid) continue;
        if (
          isOrderItemProductionFinished({
            production_start: it.production_start,
            production_end: it.production_end,
            status: it.production_status,
            completed_at: it.production_completed_at,
          })
        ) {
          continue;
        }
        rows.push({
          ...it,
          client_name: ord.client_name,
          order_number: ord.order_number,
          order_pcp_deadline: ord.pcp_deadline,
          order_delivery_deadline:
            ord.expected_delivery ?? ord.delivery_deadline,
        });
      }
    }
    return rows.sort((a, b) =>
      (a.pcp_deadline ?? "").localeCompare(b.pcp_deadline ?? "")
    );
  }, [orders, activeLineId]);

  const postProgram = useCallback(
    async (
      args: {
        order_item_id: string;
        field: "production_start" | "production_end";
        value: string | null;
      },
      opts?: { force?: boolean; override_note?: string }
    ) => {
      const body: Record<string, string | null | boolean> = {
        order_item_id: args.order_item_id,
        [args.field]: args.value,
      };
      if (opts?.force) {
        body.force = true;
        body.override_note = opts.override_note ?? "";
      }
      const res = await fetch("/api/pcp/program-production", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        conflict?: ProductionScheduleConflict;
        message?: string | null;
        max_purchase_delivery?: string | null;
        blocking_component?: string | null;
        suggested_production_end?: string | null;
      };
      if (res.status === 409) {
        const c = json.conflict ?? {
          message: json.message ?? null,
          max_purchase_delivery: json.max_purchase_delivery ?? null,
          blocking_component: json.blocking_component ?? null,
          suggested_production_end: json.suggested_production_end ?? null,
        };
        return c;
      }
      if (!res.ok) throw new Error(json.error ?? "Erro ao programar");
      return null;
    },
    []
  );

  const programMut = useMutation({
    mutationFn: (args: {
      order_item_id: string;
      field: "production_start" | "production_end";
      value: string | null;
    }) => postProgram(args),
    onSuccess: (conflictResult, vars) => {
      if (conflictResult) {
        setScheduleConflict({
          orderItemId: vars.order_item_id,
          field: vars.field,
          value: vars.value,
          conflict: conflictResult,
        });
        return;
      }
      setScheduleConflict(null);
      void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const completeMut = useMutation({
    mutationFn: async (order_item_id: string) => {
      const res = await fetch("/api/pcp/complete-item", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_item_id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao concluir");
    },
    onSuccess: () => {
      toast.success("Item concluído.");
      void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const isLoading = planningQ.isLoading || (!fixedLineId && linesQ.isLoading);
  const loadError =
    planningQ.error instanceof Error
      ? planningQ.error
      : !fixedLineId && linesQ.error instanceof Error
        ? linesQ.error
        : null;

  const refresh = () => {
    void Promise.all([
      planningQ.refetch(),
      fixedLineId ? Promise.resolve() : linesQ.refetch(),
    ]).then(() => toast.success("Lista actualizada."));
  };

  const matchedLine = fixedLineId
    ? lines.find((l) => l.id === fixedLineId)
    : undefined;
  const panelTitle =
    lineLabel ??
    (matchedLine ? `${matchedLine.code} — ${matchedLine.name}` : undefined);

  const panel = (
    <PcpLinesLegacyPanel
      lines={fixedLineId ? undefined : lines}
      selectedLineId={activeLineId}
      onLineChange={fixedLineId ? undefined : setSelectedLineId}
      hideLineFilter={Boolean(fixedLineId)}
      panelTitle={panelTitle}
      rows={lineRows}
      onProgramDate={(orderItemId, field, value) =>
        programMut.mutate({ order_item_id: orderItemId, field, value })
      }
      onNotes={async (orderItemId, notes) => {
        const res = await fetch("/api/pcp/program-production", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_item_id: orderItemId,
            production_notes: notes,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          toast.error(json.error ?? "Erro ao guardar observações");
          return;
        }
        void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
      }}
      onComplete={(orderItemId) => completeMut.mutate(orderItemId)}
      completePending={completeMut.isPending || programMut.isPending}
    />
  );

  const pageTitle = lineLabel
    ? `Programação da linha: ${lineLabel}`
    : "Linhas de produção";

  const conflictDialog = scheduleConflict ? (
    <ProductionScheduleConflictDialog
      open
      conflict={scheduleConflict.conflict}
      fieldLabel={
        scheduleConflict.field === "production_start"
          ? "início da produção"
          : "término da produção"
      }
      attemptedDate={scheduleConflict.value}
      onClose={() => setScheduleConflict(null)}
      onAdjust={(suggestedEnd) => {
        void postProgram(
          {
            order_item_id: scheduleConflict.orderItemId,
            field: "production_end",
            value: suggestedEnd,
          },
          { force: true, override_note: "Ajuste automático por PC entrega" }
        ).then(() => {
          setScheduleConflict(null);
          void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
          toast.success("Produção reprogramada.");
        });
      }}
      onKeep={(note) => {
        if (!note) {
          toast.error("Indique uma justificativa.");
          return;
        }
        void postProgram(
          {
            order_item_id: scheduleConflict.orderItemId,
            field: scheduleConflict.field,
            value: scheduleConflict.value,
          },
          { force: true, override_note: note }
        ).then(() => {
          setScheduleConflict(null);
          void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
          toast.message("Data mantida com justificativa registada.");
        });
      }}
    />
  ) : null;

  if (embedded) {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 py-16 text-slate-600 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      );
    }
    if (loadError) {
      return (
        <p className="text-sm text-red-600 py-8 text-center">{loadError.message}</p>
      );
    }
    return (
      <>
        {panel}
        {conflictDialog}
      </>
    );
  }

  return (
    <div className="pcp-legacy-shell max-w-[96rem] mx-auto space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Prazos, início/fim de produção e conclusão de itens
          </p>
        </div>
        <button
          type="button"
          disabled={isLoading}
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-slate-600 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-8 text-center">{loadError.message}</p>
      ) : (
        panel
      )}
      {conflictDialog}
    </div>
  );
}
