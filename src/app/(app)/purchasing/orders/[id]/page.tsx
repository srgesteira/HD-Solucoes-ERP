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
  PackageCheck,
  Printer,
  ShoppingCart,
} from "lucide-react";
import { purchaseOrderExtrasTotal } from "@/modules/compras/lib/purchasing/purchase-order-totals";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import type { Tables } from "@/modules/core/types/database";

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
  icms_rate?: number;
  icms_value?: number;
  icms_amount?: number;
  ipi_rate?: number;
  ipi_value?: number;
  ipi_amount?: number;
  tax_base?: number;
  received_quantity?: number;
  product?: ProductEmbedded | null;
  production_order?: ProductionOrderBrief | null;
}

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
  total_icms?: number;
  total_ipi?: number;
  total_tax_base?: number;
  freight_cost?: number;
  insurance_cost?: number;
  other_costs?: number;
  total_tax_non_creditable?: number;
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

async function receivePurchaseOrder(id: string): Promise<void> {
  const res = await fetch(`/api/purchasing/orders/${id}/receive`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao finalizar recebimento");
  }
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
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canPurchasing = isAdmin || can("purchasing");

  const [selectedStatus, setSelectedStatus] = useState<PurchaseOrderStatus | "">(
    ""
  );
  const [cancelOpen, setCancelOpen] = useState(false);

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

  const canNavigateToEdit = Boolean(
    canPurchasing &&
      order &&
      order.status !== "cancelled" &&
      order.status !== "received"
  );

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

  const canReceive = Boolean(
    isAdmin &&
      order &&
      order.status !== "received" &&
      order.status !== "cancelled"
  );

  const receiveMutation = useMutation({
    mutationFn: () => receivePurchaseOrder(orderId!),
    onSuccess: async () => {
      toast.success("Recebimento finalizado e custos actualizados.");
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Erro ao finalizar recebimento.");
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
              window.open(
                `/purchasing/orders/${orderId}/print`,
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </Button>
          {canNavigateToEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/purchasing/orders/${orderId}/edit`)
              }
            >
              <Edit className="h-4 w-4" />
              Editar pedido
            </Button>
          ) : null}
          {isAdmin ? (
            <>
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

      {canNavigateToEdit ? (
        <p className="text-sm text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          Para alterar itens, custos e condições de pagamento, use{" "}
          <Link
            href={`/purchasing/orders/${orderId}/edit`}
            className="text-brand-700 font-medium underline"
          >
            Editar pedido
          </Link>
          .
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">
            Totais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 text-sm">
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
              <dt className="text-slate-500">ICMS</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.total_icms ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">IPI</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.total_ipi ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Base cálculo</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.total_tax_base ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Outros impostos</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.tax)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Extras</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(
                  purchaseOrderExtrasTotal({
                    freight_cost: order.freight_cost,
                    insurance_cost: order.insurance_cost,
                    other_costs: order.other_costs,
                    total_tax_non_creditable: order.total_tax_non_creditable,
                  })
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="font-semibold text-lg text-brand-800 tabular-nums">
                {formatCurrency(order.total)}
              </dd>
            </div>
          </dl>
          {canReceive ? (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <Button
                type="button"
                disabled={receiveMutation.isPending}
                onClick={() => void receiveMutation.mutateAsync()}
              >
                {receiveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="h-4 w-4" />
                )}
                Recalcular custos e finalizar recebimento
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">
            Itens do pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[1000px]">
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
                    % ICMS
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    ICMS
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    % IPI
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    IPI
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Base cálculo
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Total linha
                  </th>
                </tr>
              </thead>
              <tbody>
                {!items.length ? (
                  <tr>
                    <td
colSpan={11}
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
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {line.icms_rate ?? 0}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(
                            line.icms_value ?? line.icms_amount ?? 0
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {line.ipi_rate ?? 0}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(
                            line.ipi_value ?? line.ipi_amount ?? 0
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(line.tax_base ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                          {formatCurrency(line.total_price)}
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
