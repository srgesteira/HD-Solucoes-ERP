"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { PcpPlanningItem, PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";
import {
  effectiveOrderProductionDeadline,
  formatPcpDate,
  getOrderDeadlineTrafficLight,
  getOrderPrincipalStatus,
  getOrderProductionAggregateStatus,
  orderProductionStatusLabel,
  itemProductionEndDate,
  pcpDeadlineProximityClass,
  productionDeadlineDisplayClass,
  salesDeadlineProximityClass,
  trafficRowClass,
} from "@/modules/pcp/lib/pcp-order-display";
import { pcpItemOriginClass } from "@/modules/pcp/lib/pcp-item-origin";
import { cn } from "@/shared/utils/cn";
import {
  filterPcpOrdersByTab,
  PCP_ORDERS_LIST_TAB_DEFAULT,
  PCP_ORDERS_LIST_TAB_LABELS,
  PCP_ORDERS_LIST_TABS,
  type PcpOrdersListTab,
} from "@/modules/pcp/lib/pcp-orders-list-tabs";

type ProductionLine = { id: string; code: string; name: string };

type Props = {
  orders: PcpPlanningOrder[];
  lines: ProductionLine[];
  onPcpOrderDeadline: (orderId: string, date: string | null) => void;
  onItemLine: (args: {
    sales_order_item_id: string;
    order_item_id: string | null;
    line_id: string;
  }) => void;
  onLinkPc: (item: PcpPlanningItem) => void;
  pcReceived: (item: PcpPlanningItem) => boolean;
  onMarkReadyForInvoice?: (orderId: string) => void;
  markingReadyOrderId?: string | null;
};

const ORDER_GRID =
  "grid-cols-[28px_minmax(0,0.82fr)_minmax(0,1.28fr)_minmax(0,0.88fr)_minmax(0,0.88fr)_minmax(0,1.02fr)_minmax(0,0.88fr)_minmax(0,1.95fr)]";

/** Legado order-items: sem coluna PCP por item. */
const ITEM_GRID =
  "grid-cols-[26px_minmax(0,0.5fr)_minmax(0,1.2fr)_40px_minmax(0,0.72fr)_minmax(0,0.68fr)_56px_68px_minmax(0,0.85fr)]";

function PrincipalBadge({ order }: { order: PcpPlanningOrder }) {
  const s = getOrderPrincipalStatus(order);
  if (!s) return null;
  const map: Record<string, string> = {
    atrasado: "bg-red-100 text-red-800",
    vai_atrasar: "bg-red-100 text-red-800",
    falta_linha: "bg-amber-100 text-amber-800",
    aguardando_programacao: "bg-blue-100 text-blue-800",
    programado: "bg-slate-100 text-slate-700",
    produzindo: "bg-green-100 text-green-800",
    finalizado: "bg-emerald-100 text-emerald-800",
  };
  const label: Record<string, string> = {
    atrasado: "Atrasado",
    vai_atrasar: "Vai atrasar",
    falta_linha: "Falta linha",
    aguardando_programacao: "Aguard. programação",
    programado: "Programado",
    produzindo: "Produzindo",
    finalizado: "Finalizado",
  };
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${map[s] ?? ""}`}
    >
      {label[s] ?? s}
    </span>
  );
}

export function PcpOrdersLegacyPanel({
  orders,
  lines,
  onPcpOrderDeadline,
  onItemLine,
  onLinkPc,
  pcReceived,
  onMarkReadyForInvoice,
  markingReadyOrderId,
}: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ordersTab, setOrdersTab] = useState<PcpOrdersListTab>(
    PCP_ORDERS_LIST_TAB_DEFAULT
  );

  const filtered = useMemo(() => {
    const byTab = filterPcpOrdersByTab(orders, ordersTab);
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        o.client_name.toLowerCase().includes(q) ||
        o.items.some(
          (it) =>
            (it.product_code ?? "").toLowerCase().includes(q) ||
            it.product_name.toLowerCase().includes(q)
        )
    );
  }, [orders, search, ordersTab]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-800 shrink-0">Pedidos</h2>
          <input
            type="search"
            className="w-full sm:w-72 min-h-[36px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs"
            placeholder="Buscar pedido, cliente ou item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <nav
          className="flex flex-wrap gap-1 border-b border-slate-200 -mx-1"
          role="tablist"
          aria-label="Filtrar pedidos por situação"
        >
          {PCP_ORDERS_LIST_TABS.map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={ordersTab === tabId}
              className={cn(
                "px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap",
                ordersTab === tabId
                  ? "border-brand-700 text-brand-800 font-medium"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              )}
              onClick={() => setOrdersTab(tabId)}
            >
              {PCP_ORDERS_LIST_TAB_LABELS[tabId]}
            </button>
          ))}
        </nav>
      </div>

      <div className="overflow-x-auto border-b border-slate-200">
        <div
          className={`grid ${ORDER_GRID} gap-2 px-3 sm:px-4 py-2 min-h-[42px] items-center text-[11px] font-semibold text-slate-500 min-w-[820px]`}
        >
          <span />
          <span>Nº Pedido</span>
          <span>Cliente</span>
          <span className="text-center">Data Início</span>
          <span className="text-center">Prazo Vendas</span>
          <span className="text-center">Prazo PCP</span>
          <span className="text-center">Prazo Produção</span>
          <span className="text-right">Status</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-slate-500">
          {search.trim()
            ? "Nenhum pedido encontrado para esta busca."
            : `Nenhum pedido em «${PCP_ORDERS_LIST_TAB_LABELS[ordersTab]}».`}
        </p>
      ) : (
        <div className="overflow-x-auto min-w-[820px]">
          {filtered.map((order) => {
            const isOpen = expanded.has(order.id);
            const traffic = getOrderDeadlineTrafficLight(order);
            const prodDeadline = effectiveOrderProductionDeadline(order);
            const trafficTitle =
              traffic === "white"
                ? undefined
                : traffic === "red"
                  ? "Alerta: PCP após vendas ou produção após vendas."
                  : traffic === "yellow"
                    ? "Atenção: produção após o PCP e até a data de vendas, ou as três datas iguais."
                    : "OK: produção até o PCP, antes de vendas.";
            return (
              <div key={order.id}>
                <div
                  className={`grid ${ORDER_GRID} gap-2 px-3 sm:px-4 py-1.5 border-b border-slate-200 text-xs items-center transition-colors ${trafficRowClass(traffic)}`}
                  title={trafficTitle}
                >
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggleExpand(order.id)}
                      className="text-slate-500 hover:text-slate-800 w-6"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "▼" : "▶"}
                    </button>
                  </div>
                  <div className="font-medium text-slate-800">
                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="text-[#1B4F72] hover:underline font-mono"
                    >
                      {order.order_number}
                    </Link>
                  </div>
                  <div className="truncate">{order.client_name}</div>
                  <div className="text-center text-slate-600">
                    {formatPcpDate(order.created_at.slice(0, 10))}
                  </div>
                  <div
                    className={`text-center ${salesDeadlineProximityClass(order.expected_delivery)}`}
                  >
                    {formatPcpDate(order.expected_delivery)}
                  </div>
                  <div className="flex items-stretch min-h-[28px]">
                    <input
                      key={`pcp-${order.id}-${order.pcp_deadline ?? ""}`}
                      type="date"
                      className={`w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-center ${pcpDeadlineProximityClass(order.pcp_deadline)}`}
                      defaultValue={order.pcp_deadline ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== (order.pcp_deadline ?? "")) {
                          onPcpOrderDeadline(order.id, v);
                        }
                      }}
                    />
                  </div>
                  <div
                    className={`text-center ${productionDeadlineDisplayClass(prodDeadline)}`}
                    title="Maior production_end entre os itens"
                  >
                    {formatPcpDate(prodDeadline)}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1 items-center">
                    <span
                      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-800"
                      title="Situação de produção (conclusão real)"
                    >
                      {orderProductionStatusLabel(order)}
                    </span>
                    <PrincipalBadge order={order} />
                    {onMarkReadyForInvoice &&
                    getOrderProductionAggregateStatus(order) === "finished" &&
                    !order.ready_for_invoice ? (
                      <button
                        type="button"
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        disabled={markingReadyOrderId === order.id}
                        onClick={() => onMarkReadyForInvoice(order.id)}
                        title="Marcar pedido como liberado para faturamento"
                      >
                        {markingReadyOrderId === order.id
                          ? "…"
                          : "Liberar faturamento"}
                      </button>
                    ) : null}
                    {order.ready_for_invoice ? (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-900">
                        Lib. faturamento
                      </span>
                    ) : null}
                  </div>
                </div>

                {isOpen ? (
                  <div className="bg-slate-50 border-b border-slate-200">
                    <div
                      className={`grid ${ITEM_GRID} gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-slate-500 border-b border-slate-200`}
                    >
                      <span>Item</span>
                      <span className="truncate">Cód.</span>
                      <span>Descrição</span>
                      <span className="text-center">Qtd</span>
                      <span className="truncate">Linha</span>
                      <span className="text-center">Origem</span>
                      <span className="text-center">PC</span>
                      <span>Prazo prod.</span>
                    </div>
                    {order.items.map((it) => (
                      <ItemLine
                        key={it.id}
                        item={it}
                        lines={lines}
                        onItemLine={onItemLine}
                        onLinkPc={onLinkPc}
                        pcReceived={pcReceived}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemLine({
  item,
  lines,
  onItemLine,
  onLinkPc,
  pcReceived,
}: {
  item: PcpPlanningItem;
  lines: ProductionLine[];
  onItemLine: Props["onItemLine"];
  onLinkPc: Props["onLinkPc"];
  pcReceived: Props["pcReceived"];
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const hasPc = Boolean(item.purchase_order_item_id);
  const itemProdEnd = itemProductionEndDate(item);
  const pcLinkEnabled = item.origin_kind !== "estoque";

  return (
    <div
      className={`grid ${ITEM_GRID} gap-1.5 px-3 py-2 text-[10px] sm:text-xs items-center border-b border-slate-100`}
    >
      <div className="text-slate-400 text-center">{item.line_number}</div>
      <div
        className="font-mono text-[10px] text-slate-700 truncate text-center"
        title={item.product_code ?? ""}
      >
        {item.product_code ?? "—"}
      </div>
      <div
        className={
          descExpanded
            ? "cursor-pointer whitespace-normal break-words"
            : "truncate cursor-pointer hover:text-[#1B4F72]"
        }
        title={item.product_name}
        onClick={() => setDescExpanded((v) => !v)}
      >
        {item.product_name}
      </div>
      <div className="text-center tabular-nums">{item.quantity}</div>
      <div className="min-w-0">
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px] truncate"
          value={item.line_id ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onItemLine({
              sales_order_item_id: item.id,
              order_item_id: item.order_item_id,
              line_id: v,
            });
          }}
        >
          <option value="">{item.line_id ? "Sem linha" : "Linha…"}</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div
        className={`text-center text-[10px] truncate ${pcpItemOriginClass(item.origin_kind)}`}
        title={item.origin_label}
      >
        {item.origin ?? item.origin_label}
      </div>
      <div className="flex justify-center">
        {pcLinkEnabled ? (
          <button
            type="button"
            onClick={() => onLinkPc(item)}
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
              hasPc
                ? pcReceived(item)
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-red-300 bg-red-50 text-red-800"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
            title={
              hasPc
                ? pcReceived(item)
                  ? "PC recebido — clique para alterar vínculo"
                  : "PC pendente — clique para alterar vínculo"
                : "Vincular pedido de compra"
            }
          >
            {hasPc ? (
              <span className="inline-flex items-center gap-0.5">
                {pcReceived(item) ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5" />
                )}
                PC
              </span>
            ) : (
              "PC"
            )}
          </button>
        ) : (
          <span
            className="text-[10px] text-slate-400"
            title="Atendimento por estoque — PC não necessário"
          >
            —
          </span>
        )}
      </div>
      <div className="min-w-0">
        <span className="text-[10px] text-slate-500">
          {formatPcpDate(itemProdEnd)}
        </span>
      </div>
    </div>
  );
}
