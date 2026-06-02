"use client";

import type { PcpPlanningItem } from "@/modules/pcp/lib/pcp-planning";
import {
  effectiveLinePcpDeadline,
  formatPcpDate,
  lineEndVsPcpTrafficClass,
  lineRowDelayClass,
  pcpDeadlineProximityClass,
} from "@/modules/pcp/lib/pcp-order-display";
import { pcpItemOriginClass } from "@/modules/pcp/lib/pcp-item-origin";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";
import {
  formatApontamentoDateTime,
  LINE_APONTAMENTO_STATUS_LABELS,
  resolveLineApontamentoStatus,
} from "@/modules/producao/lib/line-apontamento";
import { Button } from "@/shared/ui/button";

export type LineRow = PcpPlanningItem & {
  client_name: string;
  order_number: string;
  order_pcp_deadline: string | null;
  order_delivery_deadline: string | null;
};

type ProductionLine = { id: string; code: string; name: string };

type Props = {
  lines?: ProductionLine[];
  selectedLineId?: string;
  onLineChange?: (id: string) => void;
  /** Oculta o dropdown de linha (página dedicada por linha). */
  hideLineFilter?: boolean;
  panelTitle?: string;
  rows: LineRow[];
  onProgramDate: (
    orderItemId: string,
    field: "production_start" | "production_end",
    value: string | null
  ) => void;
  onNotes: (orderItemId: string, notes: string) => void;
  onStartProduction: (orderItemId: string) => void;
  onFinishProduction: (orderItemId: string) => void;
  apontamentoPending: boolean;
  /** Histórico: só leitura, sem edição nem conclusão. */
  readOnly?: boolean;
  emptyMessage?: string;
  /** Tela do CQ: coluna extra e acções bloquear/liberar. */
  qualityControlMode?: boolean;
  onBlockFinish?: (orderItemId: string) => void;
  onReleaseFinish?: (orderItemId: string) => void;
  onShowCqHistory?: (orderItemId: string, label: string) => void;
  cqActionPending?: boolean;
};

/** Pedido, Cliente, Cód., Descrição, Qtd, Origem, Prazo PCP, PC entrega, Início/Fim plano, Obs., Apontamento */
const LINE_GRID_COLS =
  "minmax(72px,0.75fr) minmax(80px,1fr) minmax(64px,0.7fr) minmax(100px,1.25fr) 40px minmax(56px,0.55fr) 76px 76px 76px 76px minmax(72px,1fr) minmax(140px,1.35fr)";

const LINE_GRID_COLS_CQ =
  "minmax(72px,0.75fr) minmax(80px,1fr) minmax(64px,0.7fr) minmax(100px,1.25fr) 40px minmax(56px,0.55fr) 76px 76px 76px 76px minmax(72px,1fr) minmax(120px,1.2fr) minmax(100px,0.95fr)";

export function PcpLinesLegacyPanel({
  lines = [],
  selectedLineId = "",
  onLineChange,
  hideLineFilter = false,
  panelTitle,
  rows,
  onProgramDate,
  onNotes,
  onStartProduction,
  onFinishProduction,
  apontamentoPending,
  readOnly = false,
  emptyMessage,
  qualityControlMode = false,
  onBlockFinish,
  onReleaseFinish,
  onShowCqHistory,
  cqActionPending = false,
}: Props) {
  const gridCols = qualityControlMode ? LINE_GRID_COLS_CQ : LINE_GRID_COLS;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800 shrink-0">
          {panelTitle ?? "Linhas de produção"}
        </h2>
        {!hideLineFilter && lines.length > 0 && onLineChange ? (
          <label className="text-xs text-slate-600 flex items-center gap-2">
            Filtrar linha
            <select
              className="min-h-[36px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs min-w-[12rem]"
              value={selectedLineId || lines[0]?.id || ""}
              onChange={(e) => onLineChange(e.target.value)}
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className={qualityControlMode ? "min-w-[1160px]" : "min-w-[1040px]"}>
          <div
            className="grid gap-1 px-3 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-200 bg-slate-50/80 items-center"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Cód.</span>
            <span>Descrição</span>
            <span className="text-right">Qtd</span>
            <span className="text-center">Origem</span>
            <span className="text-center">Prazo PCP</span>
            <span className="text-center">PC entrega</span>
            <span className="text-center" title="Programação (plano)">
              Início plano
            </span>
            <span className="text-center" title="Programação (plano)">
              Fim plano
            </span>
            <span>Obs.</span>
            <span className="text-center">Apontamento</span>
            {qualityControlMode ? (
              <span className="text-center">CQ</span>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
              {emptyMessage ??
                (readOnly
                  ? "Nenhum item finalizado nesta linha."
                  : "Nenhum item activo nesta linha.")}
            </p>
          ) : (
            rows.map((it, idx) => {
              const completed = isOrderItemProductionFinished({
                production_start: it.production_start,
                production_end: it.production_end,
                status: it.production_status,
                completed_at: it.production_completed_at,
                apontamento_start_at: it.apontamento_start_at,
                apontamento_end_at: it.apontamento_end_at,
              });
              const apontStatus = resolveLineApontamentoStatus({
                apontamento_start_at: it.apontamento_start_at,
                apontamento_end_at: it.apontamento_end_at,
                completed_at: it.production_completed_at,
                status: it.production_status,
              });
              const originLabel =
                it.order_source === "stock"
                  ? "OP Estoque"
                  : (it.origin_label ?? it.origin ?? "Pedido");
              const pcpDeadline = effectiveLinePcpDeadline(
                it,
                it.order_pcp_deadline,
                it.order_delivery_deadline
              );
              const prodStart = it.production_start?.slice(0, 10) ?? "";
              const prodEnd = it.production_end?.slice(0, 10) ?? "";
              const pcDelivery =
                it.max_purchase_delivery_date ??
                it.purchase_order_expected_delivery;
              const pcRisk = it.purchase_risk;
              const cqBlocked = it.cq_finish_block_active === true;
              const cqReason = it.cq_finish_block_reason?.trim() ?? "";
              const priorBlocks = it.cq_finish_blocks_released_count ?? 0;

              const rowBg =
                (cqBlocked && !qualityControlMode
                  ? "bg-amber-50/90"
                  : null) ||
                lineRowDelayClass(pcpDeadline, prodEnd || null, completed) ||
                (idx % 2 === 0 ? "bg-white" : "bg-slate-50");

              return (
                <div
                  key={`${it.id}-${idx}`}
                  className={`grid gap-1 px-3 py-1.5 text-[10px] sm:text-xs items-center border-b border-slate-100 ${rowBg}`}
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <span className="font-mono truncate font-medium text-slate-800">
                    {it.order_number}
                  </span>
                  <span className="truncate" title={it.client_name}>
                    {it.client_name}
                  </span>
                  <span
                    className="font-mono truncate text-center"
                    title={it.product_code ?? ""}
                  >
                    {it.product_code ?? "—"}
                  </span>
                  <span className="truncate" title={it.product_name}>
                    {it.product_name}
                  </span>
                  <span className="text-right tabular-nums">{it.quantity}</span>
                  <span
                    className={`text-center text-[10px] font-medium truncate ${pcpItemOriginClass(it.origin_kind)}`}
                    title={
                      it.has_bom
                        ? "Possui lista de materiais (BOM)"
                        : it.product_nature
                          ? `Natureza: ${it.product_nature}`
                          : undefined
                    }
                  >
                    {originLabel}
                  </span>
                  <span
                    className={`text-center ${pcpDeadlineProximityClass(pcpDeadline)}`}
                  >
                    {formatPcpDate(pcpDeadline)}
                  </span>
                  <span
                    className={`text-center text-[10px] font-medium ${
                      pcRisk === "critical"
                        ? "text-red-700"
                        : pcRisk === "warning"
                          ? "text-amber-700"
                          : "text-slate-600"
                    }`}
                    title={
                      it.purchase_order_id
                        ? `Status PC: ${it.purchase_order_status ?? "—"} · maior entrega componentes`
                        : "Maior entrega prevista dos componentes"
                    }
                  >
                    {formatPcpDate(pcDelivery)}
                  </span>
                  <span className="text-center">
                    {readOnly ? (
                      <span className="text-[10px] tabular-nums">
                        {formatPcpDate(prodStart || null)}
                      </span>
                    ) : (
                      <input
                        type="date"
                        className="w-full max-w-[4.75rem] rounded-md border border-slate-300 bg-white px-0.5 py-0.5 text-[10px] text-center mx-auto"
                        value={prodStart}
                        onChange={(e) => {
                          if (!it.order_item_id) return;
                          onProgramDate(
                            it.order_item_id,
                            "production_start",
                            e.target.value || null
                          );
                        }}
                        disabled={!it.order_item_id}
                      />
                    )}
                  </span>
                  <span className="text-center">
                    {readOnly ? (
                      <span
                        className={`text-[10px] tabular-nums ${lineEndVsPcpTrafficClass(pcpDeadline, prodEnd || null, completed)}`}
                      >
                        {formatPcpDate(prodEnd || null)}
                      </span>
                    ) : (
                      <input
                        type="date"
                        className={`w-full max-w-[4.75rem] rounded-md border border-slate-300 bg-white px-0.5 py-0.5 text-[10px] text-center mx-auto ${lineEndVsPcpTrafficClass(pcpDeadline, prodEnd || null, completed)}`}
                        value={prodEnd}
                        onChange={(e) => {
                          if (!it.order_item_id) return;
                          onProgramDate(
                            it.order_item_id,
                            "production_end",
                            e.target.value || null
                          );
                        }}
                        disabled={!it.order_item_id}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    {readOnly ? (
                      <span
                        className="block truncate text-[10px] text-slate-600"
                        title={it.production_notes ?? ""}
                      >
                        {it.production_notes?.trim() || "—"}
                      </span>
                    ) : (
                      <input
                        type="text"
                        className="w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                        defaultValue={it.production_notes ?? ""}
                        placeholder="Obs…"
                        onBlur={(e) => {
                          if (!it.order_item_id) return;
                          onNotes(it.order_item_id, e.target.value);
                        }}
                        disabled={!it.order_item_id}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex flex-col gap-1 py-0.5">
                    {cqBlocked && !qualityControlMode ? (
                      <span
                        className="inline-flex w-fit items-center rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900"
                        title={
                          cqReason
                            ? `Motivo: ${cqReason}`
                            : "Bloqueado pelo Controle de Qualidade"
                        }
                      >
                        Bloqueado CQ
                      </span>
                    ) : null}
                    {cqBlocked && !qualityControlMode && cqReason ? (
                      <span
                        className="text-[9px] text-amber-900 leading-snug line-clamp-2"
                        title={cqReason}
                      >
                        {cqReason}
                      </span>
                    ) : null}
                    <span
                      className={`text-[10px] font-semibold ${
                        apontStatus === "finished"
                          ? "text-emerald-700"
                          : apontStatus === "in_progress"
                            ? "text-blue-700"
                            : "text-slate-600"
                      }`}
                    >
                      {LINE_APONTAMENTO_STATUS_LABELS[apontStatus]}
                    </span>
                    {it.apontamento_start_at ? (
                      <span className="text-[9px] text-slate-600 tabular-nums">
                        Início: {formatApontamentoDateTime(it.apontamento_start_at)}
                      </span>
                    ) : null}
                    {(it.apontamento_end_at || it.production_completed_at) &&
                    apontStatus === "finished" ? (
                      <span className="text-[9px] text-slate-600 tabular-nums">
                        Fim:{" "}
                        {formatApontamentoDateTime(
                          it.apontamento_end_at ?? it.production_completed_at
                        )}
                      </span>
                    ) : null}
                    {!readOnly && it.order_item_id ? (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {apontStatus === "not_started" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={apontamentoPending}
                            onClick={() => onStartProduction(it.order_item_id!)}
                          >
                            Iniciar produção
                          </Button>
                        ) : null}
                        {apontStatus === "in_progress" ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={apontamentoPending || cqBlocked}
                            title={
                              cqBlocked
                                ? cqReason
                                  ? `Finalização bloqueada pelo CQ: ${cqReason}`
                                  : "Finalização bloqueada pelo Controle de Qualidade"
                                : undefined
                            }
                            onClick={() => onFinishProduction(it.order_item_id!)}
                          >
                            Finalizar produção
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </span>
                  {qualityControlMode ? (
                    <span className="min-w-0 flex flex-col gap-1 py-0.5 items-center text-center">
                      <span
                        className={`text-[10px] font-semibold ${
                          cqBlocked ? "text-amber-800" : "text-emerald-700"
                        }`}
                      >
                        {cqBlocked ? "Bloqueado" : "Liberado"}
                      </span>
                      {priorBlocks > 0 ? (
                        <button
                          type="button"
                          className="text-[9px] text-brand-700 underline disabled:opacity-50"
                          disabled={!it.order_item_id || !onShowCqHistory}
                          onClick={() => {
                            if (!it.order_item_id || !onShowCqHistory) return;
                            onShowCqHistory(
                              it.order_item_id,
                              `${it.order_number} · ${it.product_name}`
                            );
                          }}
                        >
                          {priorBlocks === 1
                            ? "1 bloqueio anterior"
                            : `${priorBlocks} bloqueios anteriores`}
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-500">
                          Sem bloqueios anteriores
                        </span>
                      )}
                      {it.order_item_id && onShowCqHistory ? (
                        <button
                          type="button"
                          className="text-[9px] text-slate-600 underline"
                          onClick={() =>
                            onShowCqHistory(
                              it.order_item_id!,
                              `${it.order_number} · ${it.product_name}`
                            )
                          }
                        >
                          Ver histórico completo
                        </button>
                      ) : null}
                      {!readOnly && it.order_item_id && apontStatus !== "finished" ? (
                        <div className="flex flex-wrap gap-1 justify-center pt-0.5">
                          {cqBlocked ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                              disabled={cqActionPending}
                              onClick={() => onReleaseFinish?.(it.order_item_id!)}
                            >
                              Liberar
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] border-amber-300 text-amber-900 hover:bg-amber-50"
                              disabled={cqActionPending}
                              onClick={() => onBlockFinish?.(it.order_item_id!)}
                            >
                              Bloquear fim
                            </Button>
                          )}
                        </div>
                      ) : null}
                      {cqBlocked && cqReason ? (
                        <span
                          className="text-[9px] text-amber-900 leading-snug line-clamp-3 w-full"
                          title={cqReason}
                        >
                          {cqReason}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
