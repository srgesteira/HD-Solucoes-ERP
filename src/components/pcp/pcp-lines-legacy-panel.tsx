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
  onComplete: (orderItemId: string) => void;
  completePending: boolean;
};

/** Pedido, Cliente, Cód., Descrição, Qtd, Origem, Prazo PCP, PC entrega, Início/Fim Prod., Obs., Ocorr., ✓ */
const LINE_GRID_COLS =
  "minmax(72px,0.75fr) minmax(80px,1fr) minmax(64px,0.7fr) minmax(100px,1.25fr) 40px minmax(56px,0.55fr) 76px 76px 76px 76px minmax(72px,1fr) 56px 44px";

export function PcpLinesLegacyPanel({
  lines = [],
  selectedLineId = "",
  onLineChange,
  hideLineFilter = false,
  panelTitle,
  rows,
  onProgramDate,
  onNotes,
  onComplete,
  completePending,
}: Props) {
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
        <div className="min-w-[1040px]">
          <div
            className="grid gap-1 px-3 py-2 text-[11px] font-semibold text-slate-500 border-b border-slate-200 bg-slate-50/80 items-center"
            style={{ gridTemplateColumns: LINE_GRID_COLS }}
          >
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Cód.</span>
            <span>Descrição</span>
            <span className="text-right">Qtd</span>
            <span className="text-center">Origem</span>
            <span className="text-center">Prazo PCP</span>
            <span className="text-center">PC entrega</span>
            <span className="text-center">Início Prod.</span>
            <span className="text-center">Fim Prod.</span>
            <span>Obs.</span>
            <span className="text-center">Ocorr.</span>
            <span className="text-center">✓</span>
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">
              Nenhum item activo nesta linha.
            </p>
          ) : (
            rows.map((it, idx) => {
              const completed = isOrderItemProductionFinished({
                production_start: it.production_start,
                production_end: it.production_end,
                status: it.production_status,
                completed_at: it.production_completed_at,
              });
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
              const rowBg =
                lineRowDelayClass(pcpDeadline, prodEnd || null, completed) ||
                (idx % 2 === 0 ? "bg-white" : "bg-slate-50");

              return (
                <div
                  key={`${it.id}-${idx}`}
                  className={`grid gap-1 px-3 py-1.5 text-[10px] sm:text-xs items-center border-b border-slate-100 ${rowBg}`}
                  style={{ gridTemplateColumns: LINE_GRID_COLS }}
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
                    {it.origin ?? it.origin_label}
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
                  </span>
                  <span className="text-center">
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
                  </span>
                  <span className="min-w-0">
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
                  </span>
                  <span className="text-center text-[10px]">
                    {it.quality_control ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 border border-slate-200">
                        {it.quality_control}
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="flex justify-center">
                    {!completed ? (
                      <button
                        type="button"
                        disabled={!it.order_item_id || completePending}
                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-300 text-[10px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                        title="Concluir (preenche fim com hoje se vazio)"
                        onClick={() => {
                          if (it.order_item_id) onComplete(it.order_item_id);
                        }}
                      >
                        ✓
                      </button>
                    ) : (
                      <span className="text-emerald-600 text-xs" title="Concluído">
                        ✓
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
