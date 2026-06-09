"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { NumericInput } from "@/shared/ui/numeric-input";
import { SupplierSelectField } from "@/components/purchasing/supplier-select-field";
import type { SupplierOption } from "@/components/purchasing/supplier-quick-create-modal";
import { SUPPLIERS_ACTIVE_QUERY_KEY } from "@/modules/compras/lib/suppliers/query-keys";
import { PaymentTermsFields } from "@/components/shared/payment-terms-fields";
import {
  PurchaseOrderItemsEditor,
  buildPurchaseOrderItemsPayload,
  newPurchaseLine,
  reindexPurchaseLines,
  type PurchaseLineProduct,
  type PurchaseOrderLineDraft,
} from "@/components/purchasing/purchase-order-items-editor";
import { purchaseOrderPaymentUpdateSchema } from "@/shared/contracts/purchase-order.schema";
import { canEditPurchaseOrderItems } from "@/modules/compras/lib/purchasing/purchase-order-edit";
import { aggregatePurchaseLineTaxes } from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { computePurchaseOrderTotal } from "@/modules/compras/lib/purchasing/purchase-order-totals";
export type PurchaseOrderFormData = {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery: string | null;
  actual_delivery?: string | null;
  notes: string | null;
  supplier_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  freight_cost: number;
  insurance_cost: number;
  other_costs: number;
  total_tax_non_creditable: number;
  total_icms?: number;
  total_ipi?: number;
  total_tax_base?: number;
  total: number;
  payment_installments?: number;
  payment_days_to_first_due?: number;
  payment_days_between_installments?: number;
  items?: Array<{
    id: string;
    product_id: string | null;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
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
  supplier?: { id: string; name: string; code: string | null } | null;
};

type Props = {
  mode: "create" | "edit";
  orderId?: string;
  cancelHref: string;
  onSaved: (orderId: string) => void;
  /** Integrado na página única de detalhe (sem duplicar cabeçalho/listagem). */
  embedded?: boolean;
  /** Ex.: botão de recebimento (só na página de detalhe). */
  totalsFooter?: ReactNode;
  canSave?: boolean;
};

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

type OrderItemRow = NonNullable<PurchaseOrderFormData["items"]>[number];

type ProductNested = {
  id: string;
  name: string;
  unit: string | null;
  technical_code: string | null;
  code: string | null;
};

function unwrapProduct(p: OrderItemRow["product"]) {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p as ProductNested;
}

export function itemsToPurchaseLines(items: OrderItemRow[]): {
  lines: PurchaseOrderLineDraft[];
  cache: Record<string, PurchaseLineProduct>;
} {
  const cache: Record<string, PurchaseLineProduct> = {};
  const lines: PurchaseOrderLineDraft[] = [];

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
    lines: lines.length ? reindexPurchaseLines(lines) : [newPurchaseLine(0)],
    cache,
  };
}

async function fetchActiveSuppliers(): Promise<SupplierOption[]> {
  const params = new URLSearchParams({
    is_active: "true",
    page: "1",
    limit: "500",
  });
  const res = await fetch(`/api/purchasing/suppliers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: SupplierOption[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar fornecedores"
    );
  }
  if (!Array.isArray(json.data)) throw new Error("Resposta inválida da API");
  return json.data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    document: null,
    email: null,
    phone: null,
  }));
}

async function fetchOrder(id: string): Promise<PurchaseOrderFormData> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PurchaseOrderFormData | null;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedido");
  if (!json.data) throw new Error("Pedido não encontrado.");
  return json.data;
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return String(iso);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function PurchaseOrderForm({
  mode,
  orderId,
  cancelHref,
  onSaved,
  embedded = false,
  totalsFooter,
  canSave = true,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";

  const [hydrated, setHydrated] = useState(!isEdit);
  const [poNumber, setPoNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(isEdit ? "" : todayISODate());
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [freightCost, setFreightCost] = useState(0);
  const [insuranceCost, setInsuranceCost] = useState(0);
  const [otherCosts, setOtherCosts] = useState(0);
  const [taxNonCreditable, setTaxNonCreditable] = useState(0);
  const [paymentInstallments, setPaymentInstallments] = useState("1");
  const [paymentDaysFirst, setPaymentDaysFirst] = useState("30");
  const [paymentDaysBetween, setPaymentDaysBetween] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLineDraft[]>(() => [
    newPurchaseLine(0),
  ]);
  const [productCache, setProductCache] = useState<
    Record<string, PurchaseLineProduct>
  >({});

  const orderQuery = useQuery({
    queryKey: ["purchasing-order", orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: isEdit && Boolean(orderId),
  });

  const order = orderQuery.data;
  const canEditItems =
    !isEdit || Boolean(order && canEditPurchaseOrderItems(order.status));
  const canEditExtras = !isEdit || canEditItems;
  const fieldsDisabled = isEdit && !canEditItems;
  const showSave = canSave && canEditItems;

  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isEdit) return;
    const st = order?.status;
    if (st === undefined) return;
    if (
      prevStatusRef.current !== undefined &&
      st !== prevStatusRef.current
    ) {
      setHydrated(false);
    }
    prevStatusRef.current = st;
  }, [order?.status, isEdit]);

  const suppliersQuery = useQuery({
    queryKey: [...SUPPLIERS_ACTIVE_QUERY_KEY, isEdit ? "po-edit" : "po-new"],
    queryFn: fetchActiveSuppliers,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isEdit) return;
    setHydrated(false);
  }, [orderId, isEdit]);

  useEffect(() => {
    const o = orderQuery.data;
    if (!isEdit || !o || hydrated) return;

    setPoNumber(o.po_number);
    setSupplierId(o.supplier_id ?? "");
    setOrderDate(String(o.order_date).slice(0, 10));
    setExpectedDelivery(
      o.expected_delivery ? String(o.expected_delivery).slice(0, 10) : ""
    );
    setNotes(o.notes ?? "");
    setDiscount(Number(o.discount ?? 0));
    setTax(Number(o.tax ?? 0));
    setFreightCost(Number(o.freight_cost ?? 0));
    setInsuranceCost(Number(o.insurance_cost ?? 0));
    setOtherCosts(Number(o.other_costs ?? 0));
    setTaxNonCreditable(Number(o.total_tax_non_creditable ?? 0));
    setPaymentInstallments(String(o.payment_installments ?? 1));
    setPaymentDaysFirst(String(o.payment_days_to_first_due ?? 30));
    const pdb = o.payment_days_between_installments ?? 0;
    setPaymentDaysBetween(pdb > 0 ? String(pdb) : "");

    const apiItems = Array.isArray(o.items) ? o.items : [];
    const { lines: loadedLines, cache } = itemsToPurchaseLines(apiItems);
    setLines(loadedLines);
    setProductCache(cache);
    setHydrated(true);
  }, [orderQuery.data, hydrated, isEdit]);

  useEffect(() => {
    if (
      isEdit &&
      !embedded &&
      order?.status === "cancelled" &&
      orderId
    ) {
      toast.error("Pedido cancelado não pode ser editado.");
      router.replace(`/purchasing/orders/${orderId}`);
    }
  }, [order?.status, orderId, router, isEdit, embedded]);

  const mergedSupplierOptions = useMemo(() => {
    const map = new Map<string, SupplierOption>();
    for (const s of suppliersQuery.data ?? []) map.set(s.id, s);
    const o = orderQuery.data;
    if (o?.supplier_id && !map.has(o.supplier_id)) {
      map.set(o.supplier_id, {
        id: o.supplier_id,
        code: o.supplier?.code?.trim() || "—",
        name:
          o.supplier?.name?.trim() || "Fornecedor (lista apenas activos)",
        document: null,
        email: null,
        phone: null,
      });
    }
    return [...map.values()];
  }, [suppliersQuery.data, orderQuery.data]);

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

  const previewSubtotal = lineTaxPreview.subtotal;

  const previewTotal = useMemo(
    () =>
      computePurchaseOrderTotal({
        subtotal: previewSubtotal,
        discount,
        tax,
        total_icms: lineTaxPreview.totalIcms,
        total_ipi: lineTaxPreview.totalIpi,
        freight_cost: freightCost,
        insurance_cost: insuranceCost,
        other_costs: otherCosts,
        total_tax_non_creditable: taxNonCreditable,
      }),
    [
      previewSubtotal,
      discount,
      tax,
      lineTaxPreview.totalIcms,
      lineTaxPreview.totalIpi,
      freightCost,
      insuranceCost,
      otherCosts,
      taxNonCreditable,
    ]
  );

  const buildPayload = (): Record<string, unknown> => {
    const pn = poNumber.trim();
    if (isEdit && !pn) throw new Error("O número do pedido é obrigatório.");

    const od = orderDate.trim();
    if (!od) throw new Error("Indique a data do pedido.");

    const paymentParsed = purchaseOrderPaymentUpdateSchema.safeParse({
      payment_installments: paymentInstallments,
      payment_days_to_first_due: paymentDaysFirst,
      payment_days_between_installments:
        paymentDaysBetween.trim() === "" ? 0 : paymentDaysBetween,
    });
    if (!paymentParsed.success) {
      throw new Error(
        paymentParsed.error.issues[0]?.message ??
          "Condições de pagamento inválidas."
      );
    }

    const body: Record<string, unknown> = {};

    if (!isEdit || canEditItems) {
      body.po_number = pn || "";
      body.supplier_id = supplierId.trim() ? supplierId.trim() : null;
      body.order_date = od.slice(0, 10);
      body.expected_delivery = expectedDelivery.trim()
        ? expectedDelivery.slice(0, 10)
        : null;
      body.notes = notes.trim() ? notes.trim() : null;
      body.discount = discount;
      body.tax = tax;
      body.payment_installments = paymentParsed.data.payment_installments;
      body.payment_days_to_first_due =
        paymentParsed.data.payment_days_to_first_due;
      body.payment_days_between_installments =
        paymentParsed.data.payment_days_between_installments;
      body.freight_cost = freightCost;
      body.insurance_cost = insuranceCost;
      body.other_costs = otherCosts;
      body.total_tax_non_creditable = taxNonCreditable;

      const itemsResult = buildPurchaseOrderItemsPayload(lines);
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
        const res = await fetch(`/api/purchasing/orders/${orderId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar pedido");
        return orderId;
      }

      const res = await fetch("/api/purchasing/orders", {
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
      toast.success(isEdit ? "Pedido actualizado." : "Pedido de compra criado.");
      await queryClient.invalidateQueries({
        queryKey: ["purchasing-order", savedId],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
      onSaved(savedId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      {isEdit && !canEditItems ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {order?.status === "received" || order?.status === "cancelled" ? (
            order?.status === "cancelled" ? (
              "Pedido cancelado: visualização apenas."
            ) : (
              "Pedido já recebido: visualização apenas."
            )
          ) : (
            <>
              Alteração bloqueada neste estado. Mude o estado para{" "}
              <strong>Rascunho</strong> ou <strong>Enviado</strong> (acção
              «Aplicar estado» acima) para editar itens, pagamento e valores.
            </>
          )}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-slate-600" aria-hidden />
            Dados do pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="po-number">
                Número do pedido{isEdit ? " *" : ""}
              </Label>
              <Input
                id="po-number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder={
                  isEdit ? "Ex.: 15/2026" : "Gerado automaticamente (ex.: 15/2026)"
                }
                required={isEdit}
                autoComplete="off"
                disabled={fieldsDisabled}
              />
            </div>

            <SupplierSelectField
              id="po-supplier"
              className="md:col-span-2"
              value={supplierId}
              onChange={setSupplierId}
              disabled={fieldsDisabled}
              suppliers={mergedSupplierOptions}
              loading={suppliersQuery.isLoading}
              errorMessage={
                suppliersQuery.isError
                  ? suppliersQuery.error instanceof Error
                    ? suppliersQuery.error.message
                    : "Não foi possível carregar fornecedores."
                  : null
              }
              onSupplierCreated={() => {
                void queryClient.invalidateQueries({
                  queryKey: SUPPLIERS_ACTIVE_QUERY_KEY,
                });
              }}
            />

            <div className="space-y-2">
              <Label htmlFor="order-date">Data do pedido *</Label>
              <Input
                id="order-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
                disabled={fieldsDisabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected-delivery">Data prevista de entrega</Label>
              <Input
                id="expected-delivery"
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                disabled={fieldsDisabled}
              />
            </div>

            {embedded && isEdit && order?.actual_delivery ? (
              <div className="space-y-1 sm:col-span-2">
                <p className="text-xs font-medium text-slate-500">
                  Data de recebimento
                </p>
                <p className="text-sm font-medium text-slate-900 tabular-nums">
                  {formatDisplayDate(order.actual_delivery)}
                </p>
              </div>
            ) : null}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="resize-y min-h-[5rem]"
                placeholder="Opcional…"
                disabled={fieldsDisabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Itens do pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseOrderItemsEditor
            lines={lines}
            onLinesChange={setLines}
            productCache={productCache}
            onProductCacheMerge={(patch) =>
              setProductCache((prev) => ({ ...prev, ...patch }))
            }
            disabled={!canEditItems}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Condições de pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentTermsFields
            idPrefix="po-form"
            paymentInstallments={paymentInstallments}
            onPaymentInstallmentsChange={setPaymentInstallments}
            paymentDaysFirst={paymentDaysFirst}
            onPaymentDaysFirstChange={setPaymentDaysFirst}
            paymentDaysBetween={paymentDaysBetween}
            onPaymentDaysBetweenChange={setPaymentDaysBetween}
            disabled={fieldsDisabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Totais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discount">Desconto</Label>
              <NumericInput
                id="discount"
                value={discount}
                onChange={setDiscount}
                maxDecimals={2}
                disabled={fieldsDisabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax">Outros impostos (creditáveis)</Label>
              <NumericInput
                id="tax"
                value={tax}
                onChange={setTax}
                maxDecimals={2}
                disabled={fieldsDisabled}
              />
            </div>
          </div>

          {canEditExtras ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="freight">Frete</Label>
                <NumericInput
                  id="freight"
                  value={freightCost}
                  onChange={setFreightCost}
                  maxDecimals={2}
                  disabled={fieldsDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance">Seguro</Label>
                <NumericInput
                  id="insurance"
                  value={insuranceCost}
                  onChange={setInsuranceCost}
                  maxDecimals={2}
                  disabled={fieldsDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="other">Outros custos</Label>
                <NumericInput
                  id="other"
                  value={otherCosts}
                  onChange={setOtherCosts}
                  maxDecimals={2}
                  disabled={fieldsDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-nc">Impostos não creditáveis</Label>
                <NumericInput
                  id="tax-nc"
                  value={taxNonCreditable}
                  onChange={setTaxNonCreditable}
                  maxDecimals={2}
                  disabled={fieldsDisabled}
                />
              </div>
            </div>
          ) : null}

          <div className="border-t border-slate-200 pt-4 space-y-1 text-sm">
            <p>
              Subtotal (itens):{" "}
              <strong className="tabular-nums">{fmtBRL(previewSubtotal)}</strong>
            </p>
            <p>
              Total ICMS:{" "}
              <strong className="tabular-nums">
                {fmtBRL(lineTaxPreview.totalIcms)}
              </strong>
            </p>
            <p>
              Total IPI:{" "}
              <strong className="tabular-nums">
                {fmtBRL(lineTaxPreview.totalIpi)}
              </strong>
            </p>
            <p>
              Base de cálculo (soma):{" "}
              <strong className="tabular-nums">
                {fmtBRL(lineTaxPreview.totalTaxBase)}
              </strong>
            </p>
            <p className="text-xs text-slate-500">
              IPI sobre o subtotal; ICMS informativo (base = subtotal + IPI). Total =
              subtotal + IPI + custos − desconto.
            </p>
            <p className="text-lg font-semibold text-slate-900">
              Total do pedido:{" "}
              <span className="tabular-nums">{fmtBRL(previewTotal)}</span>
            </p>
          </div>
          {totalsFooter ? (
            <div className="border-t border-slate-200 pt-4">{totalsFooter}</div>
          ) : null}
        </CardContent>
      </Card>

      {showSave || !embedded ? (
        <div className="flex justify-end gap-3">
          {!embedded ? (
            <Link href={cancelHref}>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </Link>
          ) : null}
          {showSave ? (
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  A gravar…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden />
                  Guardar alterações
                </>
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
