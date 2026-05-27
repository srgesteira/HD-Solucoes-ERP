"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { PaymentTermsFields } from "@/components/shared/payment-terms-fields";
import { SalesOrderFormFields } from "@/components/sales/sales-order-form-fields";
import type { CustomerOption } from "@/components/sales/customer-quick-create-modal";
import {
  SalesOrderItemsEditor,
  buildSalesOrderItemsPayload,
  newSalesOrderLine,
  reindexSalesOrderLines,
  type SalesOrderLineDraft,
  type SalesOrderLineProduct,
} from "@/components/sales/sales-order-items-editor";
import { salesOrderCommercialUpdateSchema } from "@/shared/contracts/sales-order.schema";
import { aggregatePurchaseLineTaxes } from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { computeSalesOrderTotal } from "@/modules/vendas/lib/sales/sales-order-totals";
import type { SalesOrderEditGuard } from "@/modules/vendas/lib/sales/sales-order-edit";
import {
  addDaysToISODate,
  defaultExpectedDeliveryForOrder,
} from "@/modules/vendas/lib/sales/sales-flow";
import {
  SALES_ORDER_EDITABLE_STATUSES,
  SALES_ORDER_STATUS_LABELS,
} from "@/modules/vendas/lib/sales/sales-order-status";
import type { SalesOrderStatus } from "@/modules/core/types/sales.types";
import { cn } from "@/shared/utils/cn";

export type SalesOrderFormData = {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  client_name: string;
  client_document: string | null;
  client_email: string | null;
  expected_delivery: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
  subtotal: number;
  discount: number;
  tax: number;
  total_icms?: number;
  total_ipi?: number;
  total_tax_base?: number;
  total: number;
  notes: string | null;
  mrp_processed: boolean;
  items?: Array<{
    id: string;
    product_id: string | null;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price?: number | null;
    icms_rate?: number;
    icms_value?: number;
    icms_amount?: number;
    ipi_rate?: number;
    ipi_value?: number;
    ipi_amount?: number;
    tax_base?: number;
    product?:
      | {
          id: string;
          name: string;
          unit: string | null;
          technical_code: string | null;
          code: string | null;
        }
      | Array<{
          id: string;
          name: string;
          unit: string | null;
          technical_code: string | null;
          code: string | null;
        }>
      | null;
  }> | null;
  quote?: {
    customer_id?: string | null;
    customer?:
      | {
          id: string;
          name: string;
          document?: string | null;
          email?: string | null;
        }
      | Array<{
          id: string;
          name: string;
          document?: string | null;
          email?: string | null;
        }>
      | null;
  } | null;
  edit_guard?: SalesOrderEditGuard;
};

type Props = {
  mode: "create" | "edit";
  orderId?: string;
  cancelHref: string;
  onSaved: (orderId: string) => void;
  /** Criação manual: apenas administradores */
  requireAdminForCreate?: boolean;
  isAdmin?: boolean;
};

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

type OrderItemRow = NonNullable<SalesOrderFormData["items"]>[number];

function unwrapProduct(p: OrderItemRow["product"]) {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function unwrapCustomer(
  c:
    | {
        id: string;
        name: string;
        document?: string | null;
        email?: string | null;
      }
    | Array<{
        id: string;
        name: string;
        document?: string | null;
        email?: string | null;
      }>
    | null
    | undefined
) {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

export function itemsToSalesLines(items: OrderItemRow[]): {
  lines: SalesOrderLineDraft[];
  cache: Record<string, SalesOrderLineProduct>;
} {
  const cache: Record<string, SalesOrderLineProduct> = {};
  const lines: SalesOrderLineDraft[] = [];

  items.forEach((item, index) => {
    const prod = unwrapProduct(item.product);
    const pid = item.product_id ?? prod?.id ?? "";

    if (prod && pid) {
      cache[pid] = {
        id: prod.id,
        name: prod.name,
        unit: prod.unit,
        technical_code: prod.technical_code,
        code: prod.code,
      };
    }

    lines.push({
      key: `line-${index}`,
      id: item.id,
      productId: pid,
      description: item.description?.trim() || prod?.name || "",
      quantity: Number(item.quantity),
      unit: item.unit?.trim() || prod?.unit?.trim() || "UN",
      unitPrice: Number(item.unit_price),
      icmsRate: Number(item.icms_rate ?? 0),
      icmsValue: Number(item.icms_value ?? item.icms_amount ?? 0),
      ipiRate: Number(item.ipi_rate ?? 0),
      ipiValue: Number(item.ipi_value ?? item.ipi_amount ?? 0),
      taxBase: Number(item.tax_base ?? 0),
    });
  });

  return {
    lines: lines.length ? reindexSalesOrderLines(lines) : [newSalesOrderLine(0)],
    cache,
  };
}

async function fetchOrder(id: string): Promise<SalesOrderFormData> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: SalesOrderFormData;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedido");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function findCustomerIdByDocument(
  document: string
): Promise<CustomerOption | null> {
  const params = new URLSearchParams({
    is_active: "true",
    page: "1",
    limit: "50",
    search: document.trim(),
  });
  const res = await fetch(`/api/customers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CustomerOption[];
  };
  if (!res.ok) return null;
  const norm = (s: string) => s.replace(/\D/g, "");
  const target = norm(document);
  if (!target) return null;
  return (
    (json.data ?? []).find((c) => norm(c.document ?? "") === target) ?? null
  );
}

export function SalesOrderForm({
  mode,
  orderId,
  cancelHref,
  onSaved,
  requireAdminForCreate = false,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";

  const [hydrated, setHydrated] = useState(!isEdit);
  const [status, setStatus] = useState<SalesOrderStatus>("pending");
  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null);
  const [clientEmail, setClientEmail] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState(() =>
    isEdit ? "" : addDaysToISODate(todayISODate(), 30)
  );
  const [paymentInstallments, setPaymentInstallments] = useState("1");
  const [paymentDaysFirst, setPaymentDaysFirst] = useState("30");
  const [paymentDaysBetween, setPaymentDaysBetween] = useState(
    isEdit ? "" : "30"
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SalesOrderLineDraft[]>(() => [
    newSalesOrderLine(0),
  ]);
  const [productCache, setProductCache] = useState<
    Record<string, SalesOrderLineProduct>
  >({});
  const [seedCustomer, setSeedCustomer] = useState<CustomerOption | null>(
    null
  );

  const orderQuery = useQuery({
    queryKey: ["sales-order-edit", orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: isEdit && Boolean(orderId),
  });

  const order = orderQuery.data;
  const editGuard = order?.edit_guard;
  const adminOnlyMode = editGuard?.production_started === true;
  const canEditCommercial = isEdit
    ? editGuard?.can_edit_commercial !== false
    : true;
  const canEditItems = isEdit
    ? Boolean(order && (editGuard?.can_edit_items ?? !order.mrp_processed))
    : true;
  const productionStarted = editGuard?.production_started === true;
  const canEditStatus = isEdit && isAdmin && order?.status !== "superseded";

  useEffect(() => {
    if (!isEdit) return;
    setHydrated(false);
  }, [orderId, isEdit]);

  useEffect(() => {
    if (!isEdit || !order || hydrated) return;

    const hydrate = async () => {
      const quoteCust = unwrapCustomer(order.quote?.customer);
      let resolvedId = quoteCust?.id ?? order.quote?.customer_id ?? "";
      let seed: CustomerOption | null = null;

      if (quoteCust?.id && quoteCust.name) {
        seed = {
          id: quoteCust.id,
          name: quoteCust.name,
          document: quoteCust.document ?? null,
          email: quoteCust.email ?? null,
          phone: null,
        };
      } else if (order.client_document?.trim()) {
        const found = await findCustomerIdByDocument(order.client_document);
        if (found) {
          resolvedId = found.id;
          seed = found;
        }
      }

      if (!resolvedId && order.client_name) {
        seed = {
          id: "",
          name: order.client_name,
          document: order.client_document,
          email: order.client_email,
          phone: null,
        };
      }

      setCustomerId(resolvedId);
      setSelectedCustomer(seed);
      setSeedCustomer(seed);
      setClientEmail(order.client_email ?? quoteCust?.email ?? "");
      setExpectedDelivery(
        order.expected_delivery
          ? String(order.expected_delivery).slice(0, 10)
          : defaultExpectedDeliveryForOrder(order.order_date)
      );
      setPaymentInstallments(String(order.payment_installments ?? 1));
      setPaymentDaysFirst(String(order.payment_days_to_first_due ?? 30));
      const pdb = order.payment_days_between_installments ?? 0;
      setPaymentDaysBetween(pdb > 0 ? String(pdb) : "");
      setNotes(order.notes ?? "");
      setStatus(
        (SALES_ORDER_EDITABLE_STATUSES as readonly string[]).includes(
          order.status
        )
          ? (order.status as SalesOrderStatus)
          : "pending"
      );

      const apiItems = Array.isArray(order.items) ? order.items : [];
      const { lines: loadedLines, cache } = itemsToSalesLines(apiItems);
      setLines(loadedLines);
      setProductCache(cache);
      setHydrated(true);
    };

    void hydrate();
  }, [order, hydrated, isEdit]);

  useEffect(() => {
    if (isEdit && order?.status === "cancelled" && orderId) {
      toast.error("Pedido cancelado. Reative-o antes de editar.");
      router.replace(`/sales/orders/${orderId}`);
    }
  }, [isEdit, order?.status, orderId, router]);

  const lineTaxPreview = useMemo(() => {
    if (canEditItems) {
      return aggregatePurchaseLineTaxes(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          icmsValue: l.icmsValue,
          ipiValue: l.ipiValue,
          taxBase: l.taxBase,
        }))
      );
    }
    return {
      subtotal: Number(order?.subtotal ?? 0),
      totalIcms: Number(order?.total_icms ?? 0),
      totalIpi: Number(order?.total_ipi ?? 0),
      totalTaxBase: Number(order?.total_tax_base ?? 0),
    };
  }, [
    canEditItems,
    lines,
    order?.subtotal,
    order?.total_icms,
    order?.total_ipi,
    order?.total_tax_base,
  ]);

  const previewDiscount = Number(order?.discount ?? 0);
  const previewTax = Number(order?.tax ?? 0);
  const previewTotal = useMemo(
    () =>
      computeSalesOrderTotal({
        subtotal: lineTaxPreview.subtotal,
        discount: previewDiscount,
        tax: previewTax,
        total_ipi: lineTaxPreview.totalIpi,
      }),
    [lineTaxPreview.subtotal, lineTaxPreview.totalIpi, previewDiscount, previewTax]
  );

  const buildPayload = (): Record<string, unknown> => {
    const commercial = salesOrderCommercialUpdateSchema.safeParse({
      expected_delivery: adminOnlyMode
        ? expectedDelivery.trim() ||
          String(order?.expected_delivery ?? "").slice(0, 10) ||
          order?.order_date?.slice(0, 10) ||
          "2099-01-01"
        : expectedDelivery.trim(),
      payment_installments: paymentInstallments,
      payment_days_to_first_due: paymentDaysFirst,
      payment_days_between_installments:
        paymentDaysBetween.trim() === "" ? 0 : paymentDaysBetween,
    });
    if (!commercial.success) {
      throw new Error(
        commercial.error.issues[0]?.message ?? "Dados comerciais inválidos."
      );
    }

    const body: Record<string, unknown> = {
      notes: notes.trim() || null,
      payment_installments: commercial.data.payment_installments,
      payment_days_to_first_due: commercial.data.payment_days_to_first_due,
      payment_days_between_installments:
        commercial.data.payment_days_between_installments,
    };

    if (isEdit) {
      if (canEditCommercial) {
        if (!customerId.trim() && !adminOnlyMode) {
          throw new Error("Selecione um cliente.");
        }
        body.customer_id = customerId.trim();
        body.client_email = clientEmail.trim() || null;
        body.expected_delivery = commercial.data.expected_delivery;
      } else if (adminOnlyMode) {
        body.expected_delivery = commercial.data.expected_delivery;
      }

      if (canEditItems) {
        const itemsResult = buildSalesOrderItemsPayload(lines);
        if ("error" in itemsResult) throw new Error(itemsResult.error);
        body.items = itemsResult;
      }

      if (canEditStatus && order && status !== order.status) {
        body.status = status;
      }
    } else {
      const cust = selectedCustomer;
      const name = cust?.name?.trim() ?? "";
      if (!name) throw new Error("Selecione um cliente.");
      body.client_name = name;
      body.client_document = cust?.document ?? null;
      body.client_email = clientEmail.trim() || cust?.email || null;
      body.client_phone = cust?.phone ?? null;
      body.order_date = todayISODate();
      body.expected_delivery = commercial.data.expected_delivery;
      const itemsResult = buildSalesOrderItemsPayload(lines);
      if ("error" in itemsResult) throw new Error(itemsResult.error);
      body.items = itemsResult;
    }

    return body;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildPayload();

      if (isEdit) {
        if (!orderId) throw new Error("Pedido inválido.");
        const res = await fetch(`/api/sales/orders/${orderId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Erro ao guardar");
        return orderId;
      }

      const res = await fetch("/api/sales/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar pedido");
      if (!json.data?.id) throw new Error("Resposta inválida ao criar pedido");
      return json.data.id;
    },
    onSuccess: async (savedId) => {
      toast.success(isEdit ? "Pedido actualizado." : "Pedido de venda criado.");
      await queryClient.invalidateQueries({
        queryKey: ["sales-order", savedId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["sales-order-edit", savedId],
      });
      await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      if (isEdit) {
        await queryClient.invalidateQueries({
          queryKey: ["sales-order-logs", savedId],
        });
      }
      onSaved(savedId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (requireAdminForCreate && !isAdmin) {
    return null;
  }

  if (isEdit && (orderQuery.isLoading || !hydrated)) {
    return (
      <div className="flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A carregar pedido…</span>
      </div>
    );
  }

  if (isEdit && orderQuery.isError) {
    return (
      <p className="text-sm text-red-700 text-center py-8">
        {orderQuery.error instanceof Error
          ? orderQuery.error.message
          : "Erro ao carregar."}
      </p>
    );
  }

  return (
    <>
      {canEditStatus ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Estado do pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 max-w-md">
              <Label htmlFor="so-status">Estado</Label>
              <select
                id="so-status"
                className={cn(
                  "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm min-w-[12rem]",
                  "dark:bg-slate-950 dark:border-slate-600"
                )}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as SalesOrderStatus)
                }
              >
                {SALES_ORDER_EDITABLE_STATUSES.map((s) => (
                  <option
                    key={s}
                    value={s}
                    disabled={s === "cancelled" && productionStarted}
                  >
                    {SALES_ORDER_STATUS_LABELS[s]}
                    {s === "cancelled" && productionStarted
                      ? " (bloqueado)"
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            {productionStarted ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Produção já iniciada: não é possível cancelar este pedido.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {adminOnlyMode ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Produção já iniciada. Pode alterar prazo de entrega, observações e
          parcelas. Itens, quantidades, preços e dados do cliente estão
          bloqueados.
        </div>
      ) : null}

      {!canEditItems && isEdit && !adminOnlyMode ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          {order?.mrp_processed
            ? "Os itens não podem ser alterados após o envio ao planeamento interno."
            : "Os itens deste pedido não podem ser alterados."}
        </div>
      ) : null}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="so-notes">Observações</Label>
              <textarea
                id="so-notes"
                className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:bg-slate-950 dark:border-slate-600"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas ou para o cliente…"
              />
            </div>
            {canEditCommercial && !adminOnlyMode ? (
              <SalesOrderFormFields
                customerId={customerId}
                onCustomerIdChange={setCustomerId}
                onCustomerSelected={setSelectedCustomer}
                clientEmail={clientEmail}
                onClientEmailChange={setClientEmail}
                expectedDelivery={expectedDelivery}
                onExpectedDeliveryChange={setExpectedDelivery}
                paymentInstallments={paymentInstallments}
                onPaymentInstallmentsChange={setPaymentInstallments}
                paymentDaysFirst={paymentDaysFirst}
                onPaymentDaysFirstChange={setPaymentDaysFirst}
                paymentDaysBetween={paymentDaysBetween}
                onPaymentDaysBetweenChange={setPaymentDaysBetween}
                seedCustomer={seedCustomer}
              />
            ) : adminOnlyMode || (isEdit && !canEditCommercial) ? (
              <div className="space-y-4 pt-2">
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="so-expected-delivery-adm">
                    Prazo de entrega ao cliente{" "}
                    <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="so-expected-delivery-adm"
                    type="date"
                    required
                    value={expectedDelivery}
                    onChange={(e) => setExpectedDelivery(e.target.value)}
                  />
                </div>
                <PaymentTermsFields
                  idPrefix="so-adm"
                  paymentInstallments={paymentInstallments}
                  onPaymentInstallmentsChange={setPaymentInstallments}
                  paymentDaysFirst={paymentDaysFirst}
                  onPaymentDaysFirstChange={setPaymentDaysFirst}
                  paymentDaysBetween={paymentDaysBetween}
                  onPaymentDaysBetweenChange={setPaymentDaysBetween}
                />
              </div>
            ) : !isEdit ? (
              <SalesOrderFormFields
                customerId={customerId}
                onCustomerIdChange={setCustomerId}
                onCustomerSelected={setSelectedCustomer}
                clientEmail={clientEmail}
                onClientEmailChange={setClientEmail}
                expectedDelivery={expectedDelivery}
                onExpectedDeliveryChange={setExpectedDelivery}
                paymentInstallments={paymentInstallments}
                onPaymentInstallmentsChange={setPaymentInstallments}
                paymentDaysFirst={paymentDaysFirst}
                onPaymentDaysFirstChange={setPaymentDaysFirst}
                paymentDaysBetween={paymentDaysBetween}
                onPaymentDaysBetweenChange={setPaymentDaysBetween}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Itens do pedido</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Produto, quantidade, preço e impostos (ICMS/IPI) por linha.
            </p>
          </CardHeader>
          <CardContent>
            {canEditItems ? (
              <SalesOrderItemsEditor
                lines={lines}
                onLinesChange={setLines}
                productCache={productCache}
                onProductCacheMerge={(patch) =>
                  setProductCache((prev) => ({ ...prev, ...patch }))
                }
              />
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                      <th className="px-3 py-2 text-left font-medium">
                        Produto
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Qtd</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Unitário
                      </th>
                      <th className="px-3 py-2 text-right font-medium">IPI</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(order?.items) && order.items.length > 0 ? (
                      order.items.map((line) => {
                        const prod = unwrapProduct(line.product);
                        const total =
                          line.total_price ??
                          Number(line.quantity) * Number(line.unit_price) +
                            Number(line.ipi_value ?? 0);
                        return (
                          <tr
                            key={line.id}
                            className="border-b border-slate-100 dark:border-slate-800"
                          >
                            <td className="px-3 py-2 font-medium">
                              {prod?.name ?? line.description ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {Number(line.quantity)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fmtBRL(Number(line.unit_price))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fmtBRL(Number(line.ipi_value ?? 0))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {fmtBRL(Number(total))}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          Sem itens neste pedido.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Totais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm max-w-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Subtotal</span>
              <span className="tabular-nums font-medium">
                {fmtBRL(lineTaxPreview.subtotal)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Total ICMS</span>
              <span className="tabular-nums font-medium">
                {fmtBRL(lineTaxPreview.totalIcms)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Total IPI</span>
              <span className="tabular-nums font-medium">
                {fmtBRL(lineTaxPreview.totalIpi)}
              </span>
            </div>
            {previewDiscount > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Desconto</span>
                <span className="tabular-nums font-medium text-red-700">
                  − {fmtBRL(previewDiscount)}
                </span>
              </div>
            ) : null}
            {previewTax > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Outros impostos</span>
                <span className="tabular-nums font-medium">
                  {fmtBRL(previewTax)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="font-semibold">Total</span>
              <span className="tabular-nums font-semibold">
                {fmtBRL(previewTotal)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href={cancelHref}>
            <Button type="button" variant="outline">
              Descartar
            </Button>
          </Link>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Guardar alterações" : "Criar pedido"}
          </Button>
        </div>
      </form>
    </>
  );
}
