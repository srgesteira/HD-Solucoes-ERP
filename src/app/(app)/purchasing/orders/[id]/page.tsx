"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Edit,
  Loader2,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import type { Tables } from "@/lib/types/database";

type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial"
  | "received"
  | "cancelled";

const PO_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "partial",
  "received",
  "cancelled",
];

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  confirmed: "Confirmado",
  partial: "Parcial",
  received: "Recebido",
  cancelled: "Cancelado",
};

interface SupplierEmbedded {
  id: string;
  name: string;
  code: string | null;
}

interface ProductEmbedded {
  id?: string;
  code?: string | null;
  technical_code?: string | null;
  name?: string | null;
}

interface ProductionOrderBrief {
  id: string;
  order_number: string;
  status: string;
  client_name?: string | null;
}

interface PurchaseOrderItemEmbedded {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  received_quantity?: number;
  product?: ProductEmbedded | null;
  production_order?: ProductionOrderBrief | null;
}

interface ProductPickRow {
  id: string;
  code: string;
  name: string;
}

const PRODUCTION_IN_PROGRESS_STATUSES = new Set([
  "imported",
  "planning",
  "in_production",
  "delayed",
]);

const PRODUCTION_STATUS_LABEL_PT: Record<string, string> = {
  imported: "Importado",
  planning: "Planeamento",
  in_production: "Em produção",
  ready: "Pronto",
  finished: "Concluído",
  delayed: "Atrasado",
  cancelled: "Cancelado",
};

interface PurchaseOrderDetail {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery: string | null;
  actual_delivery: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  internal_notes?: string | null;
  supplier_id: string | null;
  supplier?: SupplierEmbedded | null;
  items?: PurchaseOrderItemEmbedded[] | null;
}

async function fetchOrderDetail(id: string): Promise<PurchaseOrderDetail> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PurchaseOrderDetail | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar pedido");
  }
  if (!json.data) throw new Error("Pedido não encontrado.");
  return json.data;
}

async function fetchCompanyBranding(): Promise<Tables<"company_settings"> | null> {
  const res = await fetch("/api/company/settings", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: Tables<"company_settings"> | null;
  };
  if (!res.ok) return null;
  return json.data ?? null;
}

async function patchOrder(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar pedido");
}

async function cancelPurchaseOrder(id: string): Promise<void> {
  await patchOrder(id, { status: "cancelled" });
}

async function fetchProductsForPick(): Promise<ProductPickRow[]> {
  const all: ProductPickRow[] = [];
  let page = 1;
  const limit = 100;

  while (page <= 20) {
    const params = new URLSearchParams({
      type: "all",
      is_active: "true",
      page: String(page),
      limit: String(limit),
    });
    const res = await fetch(`/api/products?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: ProductPickRow[];
      pagination?: { total: number };
      error?: string;
    };

    if (!res.ok) {
      throw new Error(
        typeof json.error === "string" ? json.error : "Erro ao carregar produtos"
      );
    }

    const chunk = json.data ?? [];
    for (const row of chunk) {
      all.push({
        id: row.id,
        code: row.code,
        name: row.name,
      });
    }

    if (chunk.length < limit) break;
    page += 1;
  }

  return all;
}

async function fetchProductionOrdersActive(): Promise<ProductionOrderBrief[]> {
  const all: ProductionOrderBrief[] = [];
  let page = 1;
  const limit = 100;

  while (page <= 20) {
    const params = new URLSearchParams({
      status: "all",
      page: String(page),
      limit: String(limit),
    });
    const res = await fetch(`/api/production/orders?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: ProductionOrderBrief[];
      error?: string;
    };

    if (!res.ok) {
      throw new Error(
        typeof json.error === "string"
          ? json.error
          : "Erro ao carregar ordens de produção"
      );
    }

    const chunk = json.data ?? [];
    for (const row of chunk) {
      if (PRODUCTION_IN_PROGRESS_STATUSES.has(row.status)) all.push(row);
    }

    if (chunk.length < limit) break;
    page += 1;
  }

  const byId = new Map<string, ProductionOrderBrief>();
  for (const r of all) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) =>
    a.order_number.localeCompare(b.order_number, "pt-BR")
  );
}

async function postPurchaseOrderItem(
  orderId: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/purchasing/orders/${orderId}/items`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao adicionar item");
  }
}

async function deletePurchaseOrderItem(orderId: string, itemId: string): Promise<void> {
  const params = new URLSearchParams({ itemId });
  const res = await fetch(
    `/api/purchasing/orders/${orderId}/items?${params.toString()}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao remover item");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return String(iso);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status as PurchaseOrderStatus) {
    case "draft":
      return {
        label: "Rascunho",
        className: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
      };
    case "sent":
      return {
        label: "Enviado",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        className: "bg-blue-50 text-blue-900 ring-1 ring-blue-200",
      };
    case "partial":
      return {
        label: "Parcial",
        className: "bg-orange-50 text-orange-900 ring-1 ring-orange-200",
      };
    case "received":
      return {
        label: "Recebido",
        className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        className: "bg-red-50 text-red-800 ring-1 ring-red-200",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

const SELECT_CLASS =
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60";

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const orderId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [selectedStatus, setSelectedStatus] = useState<PurchaseOrderStatus | "">(
    ""
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);
  const [mfProductId, setMfProductId] = useState("");
  const [mfDescription, setMfDescription] = useState("");
  const [mfQuantity, setMfQuantity] = useState("1");
  const [mfUnit, setMfUnit] = useState("UN");
  const [mfUnitPrice, setMfUnitPrice] = useState("");
  const [mfProductionOrderId, setMfProductionOrderId] = useState("");

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["purchasing-order", orderId],
    queryFn: () => fetchOrderDetail(orderId!),
    enabled: !!orderId,
  });

  const companyBrandingQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanyBranding,
    enabled: !!orderId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (
      order?.status &&
      PO_STATUSES.includes(order.status as PurchaseOrderStatus)
    ) {
      setSelectedStatus(order.status as PurchaseOrderStatus);
    } else if (order?.status) {
      setSelectedStatus("draft");
    }
  }, [order?.status]);

  const sb = order ? statusBadge(order.status) : null;

  const items = useMemo(() => order?.items ?? [], [order?.items]);

  const canEditItems = Boolean(
    order &&
      isAdmin &&
      (order.status === "draft" || order.status === "sent")
  );

  const pickerQueriesEnabled =
    !!orderId && isAdmin && addItemOpen && canEditItems;

  const productsPickQuery = useQuery({
    queryKey: ["purchase-order-item-picker-products"],
    queryFn: fetchProductsForPick,
    enabled: pickerQueriesEnabled,
    staleTime: 60_000,
  });

  const productionPickQuery = useQuery({
    queryKey: ["purchase-order-item-picker-production"],
    queryFn: fetchProductionOrdersActive,
    enabled: pickerQueriesEnabled,
    staleTime: 60_000,
  });

  const sortedPickProducts = useMemo(() => {
    const list = productsPickQuery.data ?? [];
    return [...list].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt-BR")
    );
  }, [productsPickQuery.data]);

  useEffect(() => {
    if (!addItemOpen) return;
    setMfProductId("");
    setMfDescription("");
    setMfQuantity("1");
    setMfUnit("UN");
    setMfUnitPrice("");
    setMfProductionOrderId("");
  }, [addItemOpen]);

  useEffect(() => {
    if (!addItemOpen || !mfProductId) return;
    const p = sortedPickProducts.find((x) => x.id === mfProductId);
    if (p) setMfDescription(p.name);
  }, [addItemOpen, mfProductId, sortedPickProducts]);

  useEffect(() => {
    if (!canEditItems && addItemOpen) setAddItemOpen(false);
  }, [canEditItems, addItemOpen]);

  const statusMutation = useMutation({
    mutationFn: (status: PurchaseOrderStatus) =>
      patchOrder(orderId!, { status }),
    onSuccess: async () => {
      toast.success("Estado actualizado.");
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Erro ao actualizar estado.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelPurchaseOrder(orderId!),
    onSuccess: async () => {
      toast.success("Pedido cancelado.");
      setCancelOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Erro ao cancelar.");
    },
  });

  const canCancel =
    isAdmin &&
    order &&
    order.status !== "cancelled" &&
    order.status !== "received";

  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Pedido inválido.");
      const desc = mfDescription.trim();
      const q = parseFloat(String(mfQuantity).replace(",", "."));
      if (!desc) throw new Error("Descrição é obrigatória.");
      if (!Number.isFinite(q) || q <= 0) {
        throw new Error("Quantidade inválida.");
      }
      const upRaw = mfUnitPrice.trim();
      const up = upRaw
        ? parseFloat(upRaw.replace(",", "."))
        : 0;
      if (!Number.isFinite(up) || up < 0) {
        throw new Error("Preço unitário inválido.");
      }
      const body: Record<string, unknown> = {
        description: desc,
        quantity: q,
        unit: mfUnit.trim() || "UN",
        unit_price: up,
      };
      if (mfProductId.trim()) body.product_id = mfProductId.trim();
      if (mfProductionOrderId.trim()) {
        body.production_order_id = mfProductionOrderId.trim();
      }
      await postPurchaseOrderItem(orderId, body);
    },
    onSuccess: async () => {
      toast.success("Item adicionado.");
      setAddItemOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await refetch();
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Erro ao adicionar item."
      );
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!orderId) throw new Error("Pedido inválido.");
      await deletePurchaseOrderItem(orderId, itemId);
    },
    onSuccess: async () => {
      toast.success("Item removido.");
      setRemoveItemId(null);
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await refetch();
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Erro ao remover item."
      );
    },
  });

  if (!orderId) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-600 space-y-4">
        <p className="text-sm">Pedido não encontrado.</p>
        <Link
          href="/purchasing/orders"
          className="text-brand-700 underline text-sm"
        >
          Voltar à listagem
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A carregar pedido…</span>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-4 text-center">
        <p className="text-sm text-red-700">
          {error instanceof Error ? error.message : "Pedido não encontrado."}
        </p>
        <Link href="/purchasing/orders">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar à listagem
          </Button>
        </Link>
      </div>
    );
  }

  const nextStatus = (selectedStatus || order.status) as PurchaseOrderStatus;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/purchasing/orders">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/purchasing/orders/${orderId}/edit`)
            }
          >
            <Edit className="h-4 w-4" />
            Editar
          </Button>
          {isAdmin ? (
            <>
              {canEditItems ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAddItemOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar item
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="h-4 w-4" />
                  Cancelar pedido
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <CompanyDocumentBranding
        settings={companyBrandingQuery.data ?? null}
        documentLabel="Pedido de compra"
      />

      <Card>
        <CardHeader className="pb-2 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-xl font-semibold text-slate-900 flex flex-wrap items-center gap-3">
                <ShoppingCart className="h-6 w-6 text-slate-600 shrink-0" />
                Pedido{" "}
                <span className="tabular-nums">{order.po_number}</span>
                {sb ? (
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                      sb.className
                    )}
                  >
                    {sb.label}
                  </span>
                ) : null}
              </CardTitle>
              <p className="text-sm text-slate-700">
                <span className="text-slate-500">Fornecedor: </span>
                <span className="font-medium">
                  {order.supplier?.name?.trim() ||
                    (order.supplier_id ? "—" : "Sem fornecedor")}
                </span>
                {order.supplier?.code ? (
                  <span className="text-slate-500">
                    {" "}
                    ({order.supplier.code})
                  </span>
                ) : null}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap items-end gap-2 shrink-0">
                <div className="space-y-1">
                  <label
                    htmlFor="po-status"
                    className="text-xs font-medium text-slate-600 block"
                  >
                    Alterar estado
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      id="po-status"
                      className={cn(SELECT_CLASS, "min-w-[11rem]")}
                      value={
                        selectedStatus ||
                        (PO_STATUSES.includes(order.status as PurchaseOrderStatus)
                          ? order.status
                          : "draft")
                      }
                      onChange={(e) =>
                        setSelectedStatus(e.target.value as PurchaseOrderStatus)
                      }
                      disabled={
                        statusMutation.isPending ||
                        order.status === "cancelled"
                      }
                    >
                      {PO_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {STATUS_LABEL[st]}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={
                        statusMutation.isPending ||
                        order.status === "cancelled" ||
                        nextStatus === order.status
                      }
                      onClick={() =>
                        PO_STATUSES.includes(nextStatus as PurchaseOrderStatus)
                          ? void statusMutation.mutateAsync(nextStatus)
                          : undefined
                      }
                    >
                      {statusMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Aplicar estado
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">
            Informações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Data do pedido</dt>
              <dd className="font-medium text-slate-900 tabular-nums">
                {formatDate(order.order_date)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Data prevista de entrega</dt>
              <dd className="font-medium text-slate-900 tabular-nums">
                {formatDate(order.expected_delivery)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Data de recebimento</dt>
              <dd className="font-medium text-slate-900 tabular-nums">
                {formatDate(order.actual_delivery)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">
            Totais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.subtotal)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Desconto</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.discount)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Impostos</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.tax)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="font-semibold text-lg text-brand-800 tabular-nums">
                {formatCurrency(order.total)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">
            Itens do pedido
          </CardTitle>
          {canEditItems ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 w-fit"
              onClick={() => setAddItemOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Adicionar item
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Produto
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Descrição
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Qtd.
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Und.
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Preço unit.
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Total linha
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right w-[7rem]">
                    Acções
                  </th>
                </tr>
              </thead>
              <tbody>
                {!items.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-slate-500"
                    >
                      Nenhuma linha neste pedido.
                    </td>
                  </tr>
                ) : (
                  items.map((line) => {
                    const sku =
                      line.product?.technical_code?.trim() ||
                      line.product?.code?.trim() ||
                      "";
                    const pname =
                      sku && line.product?.name
                        ? `${sku} — ${line.product.name}`
                        : line.product?.name?.trim() ||
                          sku ||
                          "—";
                    return (
                      <tr
                        key={line.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-3 py-2.5 text-slate-700 text-xs max-w-[12rem]">
                          <span className="line-clamp-3">{pname}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[16rem]">
                          <span className="line-clamp-3">{line.description}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {line.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                          {line.unit || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(line.unit_price)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                          {formatCurrency(line.total_price)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {canEditItems ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-red-700 border-red-200 hover:bg-red-50"
                              onClick={() => setRemoveItemId(line.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remover
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">
            Observações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">
            {order.notes?.trim() ? order.notes.trim() : "—"}
          </p>
        </CardContent>
      </Card>

      {addItemOpen && canEditItems ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-item-title"
          onClick={() =>
            !addItemMutation.isPending && setAddItemOpen(false)
          }
        >
          <div
            className="relative z-10 w-full max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="add-item-title"
              className="text-lg font-semibold text-slate-900"
            >
              Adicionar linha ao pedido
            </h3>

            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void addItemMutation.mutateAsync();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="add-product">Produto</Label>
                <select
                  id="add-product"
                  className={cn(SELECT_CLASS)}
                  value={mfProductId}
                  onChange={(e) => setMfProductId(e.target.value)}
                  disabled={
                    productsPickQuery.isPending || productsPickQuery.isFetching
                  }
                >
                  <option value="">Sem produto (só texto)</option>
                  {sortedPickProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
                {productsPickQuery.isError ? (
                  <p className="text-xs text-red-600">
                    {productsPickQuery.error instanceof Error
                      ? productsPickQuery.error.message
                      : "Erro ao carregar produtos."}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-desc">Descrição *</Label>
                <Input
                  id="add-desc"
                  value={mfDescription}
                  onChange={(e) => setMfDescription(e.target.value)}
                  required
                  placeholder="Descrição da linha"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="add-qty">Quantidade *</Label>
                  <Input
                    id="add-qty"
                    type="number"
                    min={0.0001}
                    step="any"
                    value={mfQuantity}
                    onChange={(e) => setMfQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-unit">Unidade</Label>
                  <Input
                    id="add-unit"
                    value={mfUnit}
                    onChange={(e) => setMfUnit(e.target.value)}
                    placeholder="UN"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-up">Preço unitário</Label>
                <Input
                  id="add-up"
                  type="text"
                  inputMode="decimal"
                  value={mfUnitPrice}
                  onChange={(e) => setMfUnitPrice(e.target.value)}
                  placeholder="0 (opcional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-po-link">Ordem de produção (opcional)</Label>
                <select
                  id="add-po-link"
                  className={cn(SELECT_CLASS)}
                  value={mfProductionOrderId}
                  onChange={(e) => setMfProductionOrderId(e.target.value)}
                  disabled={
                    productionPickQuery.isPending ||
                    productionPickQuery.isFetching
                  }
                >
                  <option value="">Sem vínculo à produção</option>
                  {(productionPickQuery.data ?? []).map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.order_number}
                      {po.client_name
                        ? ` — ${po.client_name.slice(0, 42)}`
                        : ""}{" "}
                      ({PRODUCTION_STATUS_LABEL_PT[po.status] ?? po.status})
                    </option>
                  ))}
                </select>
                {productionPickQuery.isError ? (
                  <p className="text-xs text-red-600">
                    {productionPickQuery.error instanceof Error
                      ? productionPickQuery.error.message
                      : "Erro ao carregar produção."}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Apenas OP em curso (importadas, planeadas, em produção,
                    atrasadas).
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={addItemMutation.isPending}
                  onClick={() => setAddItemOpen(false)}
                >
                  Fechar
                </Button>
                <Button type="submit" size="sm" disabled={addItemMutation.isPending}>
                  {addItemMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A gravar…
                    </>
                  ) : (
                    "Guardar linha"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {removeItemId && canEditItems ? (
        <div
          className="fixed inset-0 z-[101] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-item-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3
              id="remove-item-title"
              className="text-lg font-semibold text-slate-900"
            >
              Remover linha do pedido
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Esta linha será eliminada e os totais do pedido são recalculados
              pela base de dados. Confirma?
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={removeItemMutation.isPending}
                onClick={() => setRemoveItemId(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={removeItemMutation.isPending}
                onClick={() =>
                  removeItemId
                    ? void removeItemMutation.mutateAsync(removeItemId)
                    : undefined
                }
              >
                {removeItemMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A remover…
                  </>
                ) : (
                  "Remover"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelOpen ? (
        <div
          className="fixed inset-0 z-[102] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-cancel-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3
              id="detail-cancel-title"
              className="text-lg font-semibold text-slate-900"
            >
              Cancelar pedido de compra
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              O pedido{" "}
              <strong className="font-medium text-slate-900">
                {order.po_number}
              </strong>{" "}
              passará ao estado «Cancelado».
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => setCancelOpen(false)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => void cancelMutation.mutateAsync()}
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A processar…
                  </>
                ) : (
                  "Confirmar cancelamento"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
