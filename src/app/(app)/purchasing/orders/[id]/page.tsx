"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  FileUp,
  Loader2,
  Mail,
  PackageCheck,
  Printer,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from "@/shared/ui/page-helpers";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import { OrderSummaryStrip, type SummaryAlert } from "@/components/orders/order-summary-strip";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";
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

interface PurchaseOrderHeader {
  id: string;
  po_number: string;
  status: string;
}

async function fetchOrderHeader(id: string): Promise<PurchaseOrderHeader> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PurchaseOrderHeader;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedido");
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

type StatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger";

function statusBadge(
  status: string
): { label: string; tone: StatusTone; className: string } {
  switch (status as PurchaseOrderStatus) {
    case "draft":
      return {
        label: "Rascunho",
        tone: "neutral",
        className: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
      };
    case "sent":
      return {
        label: "Enviado",
        tone: "warning",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        tone: "info",
        className: "bg-blue-50 text-blue-900 ring-1 ring-blue-200",
      };
    case "partial":
      return {
        label: "Parcial",
        tone: "warning",
        className: "bg-orange-50 text-orange-900 ring-1 ring-orange-200",
      };
    case "received":
      return {
        label: "Recebido",
        tone: "success",
        className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        tone: "danger",
        className: "bg-red-50 text-red-800 ring-1 ring-red-200",
      };
    default:
      return {
        label: status,
        tone: "neutral",
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

const SELECT_CLASS =
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60";

export default function PurchaseOrderDetailPage() {
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
  const [emailPending, setEmailPending] = useState(false);

  const {
    data: orderSummary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["purchasing-order-header", orderId],
    queryFn: () => fetchOrderHeader(orderId!),
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
      orderSummary?.status &&
      PO_STATUSES.includes(orderSummary.status as PurchaseOrderStatus)
    ) {
      setSelectedStatus(orderSummary.status as PurchaseOrderStatus);
    } else if (orderSummary?.status) {
      setSelectedStatus("draft");
    }
  }, [orderSummary?.status]);

  const sb = orderSummary ? statusBadge(orderSummary.status) : null;

  // Parcelas do PC (reais e previstas) para a faixa de resumo
  const payablesQuery = useQuery({
    queryKey: ["finance-payables", "po", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/finance/payables?purchase_order_id=${orderId}&tab=all&limit=100`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        data?: { due_date: string; original_amount: number; paid_amount?: number | null; current_amount?: number | null; status: string }[];
      };
      return j.data ?? [];
    },
    enabled: !!orderId,
  });

  const poSummary = useMemo(() => {
    const o = orderSummary as unknown as Record<string, unknown> | undefined;
    if (!o) return null;
    const rows = payablesQuery.data ?? [];
    const planned = rows.reduce((a, r) => a + Number(r.original_amount || 0), 0);
    const settled = rows.reduce((a, r) => a + Number(r.paid_amount || (r.status === "paid" ? r.original_amount : 0) || 0), 0);
    const next = [...rows]
      .filter((r) => r.status !== "paid" && r.status !== "cancelled")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const total = Number(o.total || 0);
    const status = String(o.status || "draft");
    const received = status === "received";
    const supplier = (o.supplier ?? null) as { id?: string; name?: string } | null;
    const alerts: SummaryAlert[] = [];
    const exp = typeof o.expected_delivery === "string" ? o.expected_delivery : null;
    if (exp && !received && status !== "cancelled" && exp.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      alerts.push({ tone: "danger", text: "Entrega do fornecedor atrasada — cobrar o fornecedor e avisar o PCP." });
    }
    if (status === "sent") {
      alerts.push({ tone: "info", text: "PC ainda \"Enviado\": marque Confirmado quando o fornecedor confirmar, para entrar na previsão de caixa." });
    }
    if (payablesQuery.isSuccess && ["confirmed", "partial", "received"].includes(status) && rows.length === 0) {
      alerts.push({ tone: "warning", text: "PC sem parcelas a pagar no financeiro — o caixa não está vendo esta compra." });
    }
    if (rows.length && Math.abs(planned - total) > 0.05) {
      alerts.push({
        tone: "warning",
        text: `Parcelas somam ${planned.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, mas o PC vale ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      });
    }
    return {
      status,
      total,
      exp,
      received,
      supplierName: supplier?.name ?? "—",
      planned,
      settled,
      next: next ? { date: next.due_date, amount: Number(next.current_amount ?? next.original_amount) } : null,
      alerts,
    };
  }, [orderSummary, payablesQuery.data, payablesQuery.isSuccess]);

  const statusMutation = useMutation({
    mutationFn: (status: PurchaseOrderStatus) =>
      patchOrder(orderId!, { status }),
    onSuccess: async () => {
      toast.success("Estado actualizado.");
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order-header", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-orders-board"],
      });
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
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order-header", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-orders-board"],
      });
      await refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Erro ao cancelar.");
    },
  });

  const canCancel =
    isAdmin &&
    orderSummary &&
    orderSummary.status !== "cancelled" &&
    orderSummary.status !== "received";

  const canReceive = Boolean(
    canPurchasing &&
      orderSummary &&
      orderSummary.status !== "received" &&
      orderSummary.status !== "cancelled"
  );

  const receiveMutation = useMutation({
    mutationFn: () => receivePurchaseOrder(orderId!),
    onSuccess: async () => {
      toast.success("Recebimento finalizado e custos actualizados.");
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", orderId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order-header", orderId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-orders-board"],
      });
      await refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Erro ao finalizar recebimento.");
    },
  });

  if (!orderId) {
    return (
      <AppPage
        title="Pedido de compra"
        backHref="/purchasing/orders"
        backLabel="Voltar à listagem"
        width="default"
      >
        <EmptyState
          title="Pedido não encontrado"
          description="Identificador ausente."
        />
      </AppPage>
    );
  }

  if (isLoading) {
    return <LoadingState label="A carregar pedido…" />;
  }

  if (error || !orderSummary) {
    return (
      <AppPage
        title="Pedido de compra"
        backHref="/purchasing/orders"
        backLabel="Voltar à listagem"
        width="default"
      >
        <ErrorState
          message={
            error instanceof Error ? error.message : "Pedido não encontrado."
          }
        />
      </AppPage>
    );
  }

  const nextStatus = (selectedStatus ||
    orderSummary.status) as PurchaseOrderStatus;

  return (
    <AppPage
      backHref="/purchasing/orders"
      backLabel="Pedidos"
      width="default"
      density="comfortable"
      title={
        <div className="flex flex-wrap items-center gap-3">
          <ShoppingCart
            className="h-6 w-6 text-slate-600 shrink-0"
            aria-hidden
          />
          <span>Pedido</span>
          <span className="tabular-nums">{orderSummary.po_number}</span>
          {sb ? (
            <StatusBadge tone={sb.tone}>{sb.label}</StatusBadge>
          ) : null}
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
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
          {canReceive ? (
            <Link href={`/purchasing/invoices/reconcile?po=${orderId}`}>
              <Button type="button" variant="outline" size="sm">
                <FileUp className="h-4 w-4" />
                Importar / conciliar NF-e
              </Button>
            </Link>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={emailPending}
            onClick={async () => {
              setEmailPending(true);
              try {
                const res = await fetch(
                  `/api/purchasing/orders/${orderId}/email`,
                  {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  }
                );
                const json = (await res.json().catch(() => ({}))) as {
                  error?: string;
                  simulated?: boolean;
                  message?: string;
                };
                if (!res.ok) {
                  throw new Error(json.error ?? "Erro ao enviar e-mail");
                }
                if (json.simulated) {
                  toast.info(json.message ?? "E-mail simulado.");
                } else {
                  toast.success(
                    json.message ?? "Pedido enviado ao fornecedor."
                  );
                }
                await queryClient.invalidateQueries({
                  queryKey: ["purchasing-order", orderId],
                });
                await queryClient.invalidateQueries({
                  queryKey: ["purchasing-order-header", orderId],
                });
                await queryClient.invalidateQueries({
                  queryKey: ["purchasing-orders"],
                });
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Erro ao enviar e-mail"
                );
              } finally {
                setEmailPending(false);
              }
            }}
          >
            {emailPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Enviar por e-mail
          </Button>
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
          <Link href={`/purchasing/returns/new?po=${orderId}`}>
            <Button type="button" variant="outline" size="sm">
              <RotateCcw className="h-4 w-4" />
              Iniciar devolução
            </Button>
          </Link>
        </div>
      }
    >
      {poSummary ? (
        <OrderSummaryStrip
          steps={[
            { key: "draft", label: "Rascunho" },
            { key: "sent", label: "Enviado" },
            { key: "confirmed", label: "Confirmado" },
            { key: "partial", label: "Recebido parcial" },
            { key: "received", label: "Recebido" },
          ]}
          currentKey={poSummary.status}
          cancelled={poSummary.status === "cancelled"}
          partyLabel="Fornecedor"
          partyName={poSummary.supplierName}
          total={poSummary.total}
          deadline={poSummary.exp}
          deadlineLabel="Entrega do fornecedor"
          done={poSummary.received}
          finance={{ label: "Pago", planned: poSummary.planned, settled: poSummary.settled, next: poSummary.next }}
          alerts={poSummary.alerts}
        />
      ) : null}
      <div className="hidden print:block">
        <CompanyDocumentBranding
          settings={companyBrandingQuery.data ?? null}
          documentLabel="Pedido de compra"
        />
      </div>

      <Card>
        <CardHeader className="pb-2 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-slate-900">
              Estado e controle
            </CardTitle>
            {canPurchasing ? (
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
                        (PO_STATUSES.includes(
                          orderSummary.status as PurchaseOrderStatus
                        )
                          ? orderSummary.status
                          : "draft")
                      }
                      onChange={(e) =>
                        setSelectedStatus(e.target.value as PurchaseOrderStatus)
                      }
                      disabled={
                        statusMutation.isPending ||
                        orderSummary.status === "cancelled"
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
                        orderSummary.status === "cancelled" ||
                        nextStatus === orderSummary.status
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

      <PurchaseOrderForm
        mode="edit"
        orderId={orderId}
        cancelHref="/purchasing/orders"
        embedded
        canSave={canPurchasing}
        isAdmin={isAdmin}
        onSaved={async () => {
          await queryClient.invalidateQueries({
            queryKey: ["purchasing-order", orderId],
          });
          await queryClient.invalidateQueries({
            queryKey: ["purchasing-order-header", orderId],
          });
          await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
          await queryClient.invalidateQueries({
            queryKey: ["purchasing-orders-board"],
          });
          await queryClient.invalidateQueries({ queryKey: ["finance-payables"] });
          await refetch();
        }}
        totalsFooter={
          canReceive ? (
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
              Conferido / finalizar recebimento
            </Button>
          ) : orderSummary?.status === "received" ? (
            <Link
              href={`/faturamento/entrada/${orderId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              Conferir fiscal de entrada
            </Link>
          ) : undefined
        }
      />

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
                {orderSummary.po_number}
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
    </AppPage>
  );
}
