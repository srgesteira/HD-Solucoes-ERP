"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { PcpPlanningItem, PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";
import {
  pcpPlanningQueryKey,
  usePcpPlanningQuery,
} from "@/hooks/use-pcp-planning";
import type { MrpCommitSummary, MrpSuggestionsSummary } from "@/modules/pcp/lib/mrp-service";
import { PcpOrdersLegacyPanel } from "@/components/pcp/pcp-orders-legacy-panel";
import { PcpLinesPlanningView } from "@/components/pcp/pcp-lines-planning-view";
import { PcpPurchaseDependenciesPanel } from "@/components/pcp/pcp-purchase-dependencies-panel";
import { ProductCatalogPickerModal } from "@/components/products/product-catalog-picker-modal";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import { AppPage } from "@/shared/ui/app-page";
import { cn } from "@/shared/utils/cn";
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

function summarizeMrpPreview(summary: MrpSuggestionsSummary) {
  const flags = summary.suggestion_flags;
  const requisitionCount =
    (flags.purchase_order_items_marked ?? 0) +
    (flags.stock_purchase_order_items_marked ?? 0);
  const productionOrderCount = flags.production_orders_marked ?? 0;
  const salesOrderCount = summary.generated?.orders?.length ?? 0;
  const stockOrderCount = summary.stock_generated?.stock_orders?.length ?? 0;
  const warningCount = countMrpGenerateWarnings(summary);
  const salesOrders =
    summary.generated?.orders?.map((o) => o.order_number).filter(Boolean) ?? [];
  return {
    requisitionCount,
    productionOrderCount,
    salesOrderCount,
    stockOrderCount,
    warningCount,
    salesOrders,
  };
}

function countMrpGenerateWarnings(summary: MrpSuggestionsSummary): number {
  return (
    (summary.generated?.errors?.length ?? 0) +
    (summary.stock_generated?.errors?.length ?? 0)
  );
}

export function PcpPlanningView() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("orders");
  const [linkItem, setLinkItem] = useState<PcpPlanningItem | null>(null);
  const [pcSearch, setPcSearch] = useState("");
  const [pcResults, setPcResults] = useState<SearchPcRow[]>([]);
  const [pcSearching, setPcSearching] = useState(false);
  const [mrpPreviewOpen, setMrpPreviewOpen] = useState(false);
  const [mrpPreviewSummary, setMrpPreviewSummary] =
    useState<MrpSuggestionsSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pickedProduct, setPickedProduct] = useState<ProductSearchHit | null>(null);
  const [createQty, setCreateQty] = useState("1");
  const [createLineId, setCreateLineId] = useState("");

  const q = usePcpPlanningQuery();

  const linesQ = useQuery({
    queryKey: ["production-lines"],
    queryFn: fetchLines,
  });

  const lines = linesQ.data ?? [];
  const orders = q.data?.orders ?? [];

  const createMut = useMutation({
    mutationFn: async () => {
      if (!pickedProduct) throw new Error("Selecione um produto.");
      const qty = Number(createQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Quantidade inválida.");
      }
      const res = await fetch("/api/pcp/production-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: pickedProduct.id,
          quantity: qty,
          line_id: createLineId || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar OP");
    },
    onSuccess: () => {
      toast.success("Ordem de produção criada (estoque).");
      setCreateOpen(false);
      setPickedProduct(null);
      setCreateQty("1");
      setCreateLineId("");
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao criar OP"),
  });

  function clearStockOpDraft() {
    setPickedProduct(null);
    setCreateQty("1");
    setCreateLineId("");
  }

  const mrpPreview = useMemo(
    () => (mrpPreviewSummary ? summarizeMrpPreview(mrpPreviewSummary) : null),
    [mrpPreviewSummary]
  );

  function invalidateMrpQueries() {
    void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
    void qc.invalidateQueries({ queryKey: ["purchasing-requisitions"] });
    void qc.invalidateQueries({ queryKey: ["purchasing-requisitions-count"] });
    void qc.invalidateQueries({ queryKey: ["purchasing-orders"] });
  }

  const mrpRunMut = useMutation({
    mutationFn: async (): Promise<MrpSuggestionsSummary> => {
      const res = await fetch("/api/pcp/mrp-suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        generated?: MrpSuggestionsSummary;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao calcular MRP");
      if (!json.generated) throw new Error("Resposta do MRP inválida");
      return json.generated;
    },
    onSuccess: (summary) => {
      setMrpPreviewSummary(summary);
      setMrpPreviewOpen(true);
      invalidateMrpQueries();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro no MRP"),
  });

  const mrpConfirmMut = useMutation({
    mutationFn: async (): Promise<MrpCommitSummary> => {
      const res = await fetch("/api/pcp/mrp-suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        committed?: MrpCommitSummary;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao confirmar MRP");
      if (!json.committed) throw new Error("Resposta do MRP inválida");
      return json.committed;
    },
    onSuccess: (committed) => {
      toast.success(
        `MRP confirmado: ${committed.purchase_order_items_committed} requisição(ões), ${committed.production_orders_committed} OP(s).`
      );
      setMrpPreviewOpen(false);
      setMrpPreviewSummary(null);
      invalidateMrpQueries();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar MRP"),
  });

  const mrpDiscardMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pcp/mrp-suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao cancelar MRP");
    },
    onSuccess: () => {
      toast.message("MRP cancelado — nada foi efetivado.");
      setMrpPreviewOpen(false);
      setMrpPreviewSummary(null);
      invalidateMrpQueries();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar MRP"),
  });

  const mrpBusy =
    mrpRunMut.isPending ||
    mrpConfirmMut.isPending ||
    mrpDiscardMut.isPending ||
    q.isFetching;

  function handleCloseMrpPreview() {
    if (mrpConfirmMut.isPending || mrpDiscardMut.isPending) return;
    if (mrpPreviewSummary) {
      mrpDiscardMut.mutate();
      return;
    }
    setMrpPreviewOpen(false);
  }

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
    onSuccess: () => void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const orderPcpMut = useMutation({
    mutationFn: async (args: {
      orderId: string;
      pcp_deadline: string | null;
      order_source: PcpPlanningOrder["order_source"];
    }) => {
      const url =
        args.order_source === "stock"
          ? `/api/pcp/production-orders/${args.orderId}`
          : `/api/sales/orders/${args.orderId}`;
      const res = await fetch(url, {
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
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
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
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const finishStockMut = useMutation({
    mutationFn: async (productionOrderId: string) => {
      const res = await fetch("/api/pcp/finish-stock-order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_order_id: productionOrderId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao finalizar ordem de estoque");
      }
    },
    onSuccess: () => {
      toast.success("Ordem de produção finalizada no PCP.");
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
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
      void qc.invalidateQueries({ queryKey: pcpPlanningQueryKey });
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
    <AppPage
      title="Planeamento PCP"
      description="PCP Control — pedidos, linhas, PCs e apontamentos"
      width="wide"
      density="comfortable"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Criar ordem de produção
          </button>
          <button
            type="button"
            disabled={mrpBusy}
            onClick={() => mrpRunMut.mutate()}
            aria-busy={mrpRunMut.isPending || q.isFetching}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white pcp-btn-primary transition-opacity",
              mrpBusy &&
                "cursor-wait opacity-80 ring-2 ring-brand-300/60 ring-offset-1"
            )}
          >
            {mrpRunMut.isPending || q.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {mrpRunMut.isPending
              ? "A processar…"
              : q.isFetching
                ? "A actualizar…"
                : "Rodar MRP"}
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
      }
    >
      <div className="pcp-legacy-shell space-y-4">

      <ProductCatalogPickerModal
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && createMut.isPending) return;
          setCreateOpen(open);
        }}
        excludeIds={[]}
        title="Criar ordem de produção (estoque)"
        productType="finished"
        onSelect={(p) => setPickedProduct(p)}
      />

      {pickedProduct ? (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
          <p className="text-xs font-medium text-slate-600 mb-2">
            Confirmar ordem de produção (estoque)
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <div className="text-xs text-slate-600">Produto</div>
              <div className="font-medium text-slate-900">
                {pickedProduct.technical_code ||
                  pickedProduct.code ||
                  "—"}{" "}
                <span className="font-normal text-slate-700">
                  — {pickedProduct.name}
                </span>
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-600">Quantidade</span>
              <input
                className="h-9 w-28 rounded-md border border-slate-300 px-2"
                value={createQty}
                onChange={(e) => setCreateQty(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-600">Linha</span>
              <select
                className="h-9 min-w-[220px] rounded-md border border-slate-300 px-2"
                value={createLineId}
                onChange={(e) => setCreateLineId(e.target.value)}
              >
                <option value="">(usar padrão do produto)</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white pcp-btn-primary disabled:opacity-50"
            >
              {createMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Criar
            </button>
            <button
              type="button"
              disabled={createMut.isPending}
              onClick={() => {
                clearStockOpDraft();
                setCreateOpen(true);
              }}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Trocar produto
            </button>
            <button
              type="button"
              disabled={createMut.isPending}
              onClick={() => clearStockOpDraft()}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Ordem estratégica de estoque: fica ativa até finalização manual na
            linha.
          </div>
        </div>
      ) : null}

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
          onPcpOrderDeadline={(orderId, date, orderSource) =>
            orderPcpMut.mutate({
              orderId,
              pcp_deadline: date,
              order_source: orderSource,
            })
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
          onFinishStockOrder={(orderId) => finishStockMut.mutate(orderId)}
          finishingStockOrderId={
            finishStockMut.isPending && finishStockMut.variables
              ? finishStockMut.variables
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

      {mrpPreviewOpen && mrpPreview ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
            role="dialog"
            aria-labelledby="mrp-preview-title"
          >
            <h3
              id="mrp-preview-title"
              className="text-lg font-semibold text-slate-900"
            >
              Confirmar MRP
            </h3>
            <p className="text-sm text-slate-600">
              O MRP vai criar{" "}
              <strong>{mrpPreview.requisitionCount}</strong>{" "}
              {mrpPreview.requisitionCount === 1
                ? "requisição de compra"
                : "requisições de compra"}
              {" e "}
              <strong>{mrpPreview.productionOrderCount}</strong>{" "}
              {mrpPreview.productionOrderCount === 1
                ? "ordem de produção"
                : "ordens de produção"}
              .
            </p>
            {(mrpPreview.salesOrderCount > 0 ||
              mrpPreview.stockOrderCount > 0) && (
              <ul className="text-sm border border-slate-100 rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {mrpPreview.salesOrders.map((num) => (
                  <li key={num} className="text-slate-700">
                    Pedido {num}
                  </li>
                ))}
                {mrpPreview.stockOrderCount > 0 ? (
                  <li className="text-slate-700">
                    {mrpPreview.stockOrderCount} OP(s) de estoque
                  </li>
                ) : null}
              </ul>
            )}
            {mrpPreview.warningCount > 0 ? (
              <p className="text-xs text-amber-800">
                {mrpPreview.warningCount} aviso(s) durante o cálculo — reveja
                antes de confirmar.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                disabled={mrpConfirmMut.isPending || mrpDiscardMut.isPending}
                onClick={handleCloseMrpPreview}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white pcp-btn-primary disabled:opacity-70"
                disabled={mrpConfirmMut.isPending || mrpDiscardMut.isPending}
                onClick={() => mrpConfirmMut.mutate()}
              >
                {mrpConfirmMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </AppPage>
  );
}
