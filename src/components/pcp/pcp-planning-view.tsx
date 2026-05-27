"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { PcpPlanningItem, PcpPlanningOrder } from "@/lib/pcp-planning";
import { PcpOrdersLegacyPanel } from "@/components/pcp/pcp-orders-legacy-panel";
import { PcpLinesPlanningView } from "@/components/pcp/pcp-lines-planning-view";
import { PcpPurchaseDependenciesPanel } from "@/components/pcp/pcp-purchase-dependencies-panel";
import "@/components/pcp/pcp-legacy.css";

type ViewMode = "orders" | "lines" | "purchases";
type ProductionLine = { id: string; code: string; name: string };

type SearchPcRow = {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    sales_order_item_id: string | null;
    already_linked: boolean;
  }>;
};

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

async function fetchLines(): Promise<ProductionLine[]> {
  const res = await fetch("/api/production/lines", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionLine[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar linhas");
  return json.data ?? [];
}

function pcIsReceived(item: PcpPlanningItem): boolean {
  if (!item.purchase_order_item_id) return false;
  return item.purchase_order_status === "received";
}

export function PcpPlanningView() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("orders");
  const [linkItem, setLinkItem] = useState<PcpPlanningItem | null>(null);
  const [pcSearch, setPcSearch] = useState("");
  const [pcResults, setPcResults] = useState<SearchPcRow[]>([]);
  const [pcSearching, setPcSearching] = useState(false);

  const q = useQuery({
    queryKey: ["pcp-planning"],
    queryFn: fetchPlanning,
  });

  const linesQ = useQuery({
    queryKey: ["production-lines"],
    queryFn: fetchLines,
  });

  const lines = linesQ.data ?? [];
  const orders = q.data?.orders ?? [];

  const mrpMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/mrp/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: { message: string }[];
      };
      if (!res.ok) throw new Error(json.error ?? "Erro no MRP");
      if (json.errors?.length) {
        toast.warning(`${json.errors.length} pedido(s) com avisos.`);
      }
    },
    onSuccess: () => {
      toast.success("MRP processado.");
      void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
      void qc.invalidateQueries({ queryKey: ["purchasing-requisitions"] });
      void qc.invalidateQueries({ queryKey: ["purchasing-requisitions-count"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro no MRP"),
  });

  const updateLineMut = useMutation({
    mutationFn: async (args: {
      sales_order_item_id: string;
      order_item_id: string | null;
      line_id: string;
    }) => {
      const res = await fetch("/api/pcp/update-item-line", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar linha");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pcp-planning"] }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const orderPcpMut = useMutation({
    mutationFn: async (args: { orderId: string; pcp_deadline: string | null }) => {
      const res = await fetch(`/api/sales/orders/${args.orderId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcp_deadline: args.pcp_deadline }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar prazo PCP");
    },
    onSuccess: () => {
      toast.success("Prazo PCP salvo.");
      void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const markReadyMut = useMutation({
    mutationFn: async (salesOrderId: string) => {
      const res = await fetch("/api/pcp/mark-ready-for-invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_order_id: salesOrderId, manual: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao liberar para faturamento");
      }
    },
    onSuccess: () => {
      toast.success("Pedido liberado para faturamento.");
      void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const linkMut = useMutation({
    mutationFn: async (args: {
      sales_order_item_id: string;
      purchase_order_item_id: string;
    }) => {
      const res = await fetch("/api/pcp/link-purchase-order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao vincular PC");
    },
    onSuccess: () => {
      toast.success("Pedido de compra vinculado.");
      setLinkItem(null);
      setPcResults([]);
      setPcSearch("");
      void qc.invalidateQueries({ queryKey: ["pcp-planning"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  async function searchPc() {
    const term = pcSearch.trim();
    if (!term) {
      toast.error("Informe o número do PC.");
      return;
    }
    setPcSearching(true);
    try {
      const res = await fetch(
        `/api/pcp/search-pc?po_number=${encodeURIComponent(term)}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        purchase_orders?: SearchPcRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro na busca");
      setPcResults(json.purchase_orders ?? []);
      if (!json.purchase_orders?.length) {
        toast.message("Nenhum PC encontrado.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setPcResults([]);
    } finally {
      setPcSearching(false);
    }
  }

  return (
    <div className="pcp-legacy-shell max-w-[96rem] mx-auto space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Planeamento PCP
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            PCP Control — pedidos, linhas, PCs e apontamentos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={mrpMut.isPending || q.isFetching}
            onClick={() => mrpMut.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white pcp-btn-primary disabled:opacity-50"
          >
            {mrpMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Processar pedidos (MRP)
          </button>
          <button
            type="button"
            disabled={q.isFetching}
            onClick={() => {
              void q.refetch().then(() => toast.success("Lista actualizada."));
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {q.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Actualizar
          </button>
        </div>
      </div>

      <nav
        className="flex gap-1 border-b border-slate-200"
        role="tablist"
        aria-label="Vistas PCP"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "orders"}
          className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
            view === "orders" ? "pcp-tab-active" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setView("orders")}
        >
          Pedidos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "lines"}
          className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
            view === "lines" ? "pcp-tab-active" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setView("lines")}
        >
          Linhas de produção
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "purchases"}
          className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
            view === "purchases"
              ? "pcp-tab-active"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setView("purchases")}
        >
          Dependências de compras
        </button>
      </nav>

      {view === "lines" ? (
        <PcpLinesPlanningView embedded />
      ) : view === "purchases" ? (
        <PcpPurchaseDependenciesPanel />
      ) : q.isLoading ? (
        <div className="flex items-center gap-2 py-16 text-slate-600 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : q.isError ? (
        <p className="text-sm text-red-600 py-8 text-center">
          {q.error instanceof Error ? q.error.message : "Erro"}
        </p>
      ) : (
        <PcpOrdersLegacyPanel
          orders={orders}
          lines={lines}
          onPcpOrderDeadline={(orderId, date) =>
            orderPcpMut.mutate({ orderId, pcp_deadline: date })
          }
          onItemLine={(args) => updateLineMut.mutate(args)}
          onLinkPc={(item) => {
            setLinkItem(item);
            setPcSearch("");
            setPcResults([]);
          }}
          pcReceived={pcIsReceived}
          onMarkReadyForInvoice={(orderId) => markReadyMut.mutate(orderId)}
          markingReadyOrderId={
            markReadyMut.isPending && markReadyMut.variables
              ? markReadyMut.variables
              : null
          }
        />
      )}

      {linkItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-800">
              Vincular pedido de compra (PC)
            </h3>
            <p className="text-xs text-slate-600">{linkItem.product_name}</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                placeholder="Número do PC…"
                value={pcSearch}
                onChange={(e) => setPcSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchPc();
                }}
              />
              <button
                type="button"
                disabled={pcSearching}
                onClick={() => void searchPc()}
                className="rounded-md pcp-btn-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {pcSearching ? "…" : "Buscar"}
              </button>
            </div>
            {pcResults.length > 0 ? (
              <ul className="space-y-2 max-h-60 overflow-y-auto border border-slate-200 rounded-md p-2">
                {pcResults.map((po) => (
                  <li key={po.id} className="border-b border-slate-100 pb-2 last:border-0">
                    <p className="font-mono text-xs font-semibold text-[#1B4F72]">
                      {po.po_number}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Entrega: {po.expected_delivery?.slice(0, 10) ?? "—"} ·{" "}
                      {po.status}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {po.items.map((pit) => (
                        <li key={pit.id}>
                          <button
                            type="button"
                            disabled={pit.already_linked}
                            className="w-full text-left rounded border border-slate-200 px-2 py-1 text-[11px] hover:bg-slate-50 disabled:opacity-50"
                            onClick={() =>
                              linkMut.mutate({
                                sales_order_item_id: linkItem.id,
                                purchase_order_item_id: pit.id,
                              })
                            }
                          >
                            {pit.description} (qtd {pit.quantity})
                            {pit.already_linked ? " — já vinculado" : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                onClick={() => {
                  setLinkItem(null);
                  setPcResults([]);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
