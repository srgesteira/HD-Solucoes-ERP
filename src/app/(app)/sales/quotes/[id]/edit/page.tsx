"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { quoteStatusAllowsContentEdit } from "@/lib/sales/quote-access";
import { QuoteFormFields } from "@/components/sales/quote-form-fields";
import type { CustomerOption } from "@/components/sales/customer-quick-create-modal";
import {
  QuoteItemsEditor,
  buildQuoteItemsPayload,
  newQuoteLine,
  reindexQuoteLines,
  type QuoteLineDraft,
  type QuoteLineProduct,
} from "@/components/sales/quote-items-editor";
import { DEFAULT_QUOTE_MARKUP_PERCENT } from "@/lib/sales/quote-line-pricing";

type CustomerNested = {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
};

type QuoteItemApi = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  markup_percent: number | null;
  unit: string;
  product?:
    | {
        id: string;
        name: string;
        cost_price: number;
        unit: string | null;
        technical_code: string | null;
        code: string | null;
      }
    | {
        id: string;
        name: string;
        cost_price: number;
        unit: string | null;
        technical_code: string | null;
        code: string | null;
      }[]
    | null;
};

type QuoteEditData = {
  id: string;
  quote_number: string;
  status: string;
  customer_id: string | null;
  client_email: string | null;
  quote_date: string;
  validity_days: number | null;
  payment_terms: string | null;
  expected_delivery_date: string | null;
  payment_installments: number | null;
  payment_days_to_first_due: number | null;
  payment_days_between_installments: number | null;
  delivery_deadline: string | null;
  shipping_type: string | null;
  notes: string | null;
  customer?: CustomerNested | CustomerNested[] | null;
  items?: QuoteItemApi[] | null;
};

async function fetchQuote(id: string): Promise<QuoteEditData> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: QuoteEditData;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar orçamento");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

function unwrapProduct(p: QuoteItemApi["product"]) {
  if (Array.isArray(p)) return p[0] ?? null;
  return p ?? null;
}

function itemsToLinesAndCache(
  items: QuoteItemApi[]
): { lines: QuoteLineDraft[]; cache: Record<string, QuoteLineProduct> } {
  const cache: Record<string, QuoteLineProduct> = {};
  const lines: QuoteLineDraft[] = [];

  items.forEach((item, index) => {
    const pid = item.product_id;
    if (!pid) return;
    const prod = unwrapProduct(item.product);
    const cost = Number(prod?.cost_price ?? 0);
    const unitPrice = Number(item.unit_price);
    const usesMarkup = item.markup_percent != null;
    const markup = usesMarkup
      ? Number(item.markup_percent)
      : DEFAULT_QUOTE_MARKUP_PERCENT;

    if (prod) {
      cache[pid] = {
        id: prod.id,
        name: prod.name,
        cost_price: cost,
        unit: prod.unit,
        technical_code: prod.technical_code,
        code: prod.code,
      };
    }

    lines.push({
      key: `line-${index}`,
      productId: pid,
      quantity: Number(item.quantity),
      priceMode: usesMarkup ? "markup" : "manual",
      markupPercent: markup,
      manualPrice: unitPrice,
      costPrice: cost,
      unitPrice,
      unit: item.unit?.trim() || prod?.unit?.trim() || "UN",
    });
  });

  return {
    lines: lines.length ? reindexQuoteLines(lines) : [newQuoteLine(0)],
    cache,
  };
}

export default function EditQuotePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEditQuotes = isAdmin || can("sales");

  const [hydrated, setHydrated] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [quoteDate, setQuoteDate] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [paymentInstallments, setPaymentInstallments] = useState("1");
  const [paymentDaysFirst, setPaymentDaysFirst] = useState("30");
  const [paymentDaysBetween, setPaymentDaysBetween] = useState("30");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [shippingType, setShippingType] = useState("FOB");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLineDraft[]>(() => [newQuoteLine(0)]);
  const [productCache, setProductCache] = useState<
    Record<string, QuoteLineProduct>
  >({});

  const { data: quote, isLoading, error } = useQuery({
    queryKey: ["sales-quote-edit", id],
    queryFn: () => fetchQuote(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!quote || hydrated) return;
    setQuoteNumber(quote.quote_number ?? "");
    setCustomerId(quote.customer_id ?? "");
    setClientEmail(quote.client_email ?? "");
    setQuoteDate(String(quote.quote_date ?? "").slice(0, 10));
    setValidityDays(String(quote.validity_days ?? 30));
    setPaymentTerms(quote.payment_terms ?? "");
    setExpectedDeliveryDate(
      quote.expected_delivery_date
        ? String(quote.expected_delivery_date).slice(0, 10)
        : ""
    );
    setPaymentInstallments(String(quote.payment_installments ?? 1));
    setPaymentDaysFirst(String(quote.payment_days_to_first_due ?? 30));
    setPaymentDaysBetween(String(quote.payment_days_between_installments ?? 30));
    setDeliveryDeadline(quote.delivery_deadline ?? "");
    setShippingType(quote.shipping_type ?? "FOB");
    setNotes(quote.notes ?? "");

    const apiItems = Array.isArray(quote.items) ? quote.items : [];
    const { lines: loadedLines, cache } = itemsToLinesAndCache(apiItems);
    setLines(loadedLines);
    setProductCache(cache);
    setHydrated(true);
  }, [quote, hydrated]);

  const productById = useMemo(() => {
    const map = new Map<string, QuoteLineProduct>();
    for (const p of Object.values(productCache)) map.set(p.id, p);
    return map;
  }, [productCache]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!customerId.trim()) {
        throw new Error("Selecione um cliente.");
      }
      const vd = parseInt(validityDays.trim(), 10);
      if (!Number.isFinite(vd) || vd < 1) {
        throw new Error("Validade em dias deve ser ≥ 1.");
      }

      const itemsResult = buildQuoteItemsPayload(lines, productById);
      if ("error" in itemsResult) {
        throw new Error(itemsResult.error);
      }

      const res = await fetch(`/api/sales/quotes/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId.trim(),
          client_email: clientEmail.trim() || null,
          quote_date: quoteDate.slice(0, 10),
          validity_days: vd,
          payment_terms: paymentTerms.trim() || null,
          expected_delivery_date: expectedDeliveryDate.trim() || null,
          payment_installments: parseInt(paymentInstallments, 10) || 1,
          payment_days_to_first_due: parseInt(paymentDaysFirst, 10) || 30,
          payment_days_between_installments:
            parseInt(paymentDaysBetween, 10) || 30,
          delivery_deadline: deliveryDeadline.trim() || null,
          shipping_type: shippingType,
          notes: notes.trim() || null,
          items: itemsResult,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar");
    },
    onSuccess: () => {
      toast.success("Orçamento atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["sales-quote", id] });
      void queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
      router.push(`/sales/quotes/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canEditQuotes) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <p className="text-sm text-slate-600">
          Sem permissão para editar orçamentos.
        </p>
        <Link href="/sales/quotes">
          <Button type="button" variant="outline" size="sm" className="mt-4">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">A carregar…</p>;
  }
  if (error) {
    return <p className="text-red-700 text-sm">{error.message}</p>;
  }

  const seedCustomer: CustomerOption | null = (() => {
    if (!quote) return null;
    const c = Array.isArray(quote.customer) ? quote.customer[0] : quote.customer;
    if (c?.id && c?.name) {
      return {
        id: c.id,
        name: c.name,
        document: c.document ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
      };
    }
    if (quote.customer_id) {
      return {
        id: quote.customer_id,
        name: "Cliente",
        document: null,
        email: null,
        phone: null,
      };
    }
    return null;
  })();

  if (quote && !quoteStatusAllowsContentEdit(quote.status)) {
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <p className="text-sm text-slate-600">
          Este orçamento não pode ser alterado no estado actual.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => router.push(`/sales/quotes/${id}`)}
        >
          Ver detalhes
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Link href={`/sales/quotes/${id}`}>
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Detalhes
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {quote?.status === "draft" ? "Editar" : "Revisar"} orçamento{" "}
          {quoteNumber}
        </h1>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do orçamento</CardTitle>
          </CardHeader>
          <CardContent>
            <QuoteFormFields
              quoteNumber={quoteNumber}
              onQuoteNumberChange={() => {}}
              quoteNumberReadOnly
              seedCustomer={seedCustomer}
              customerId={customerId}
              onCustomerIdChange={setCustomerId}
              clientEmail={clientEmail}
              onClientEmailChange={setClientEmail}
              quoteDate={quoteDate}
              onQuoteDateChange={setQuoteDate}
              validityDays={validityDays}
              onValidityDaysChange={setValidityDays}
              paymentTerms={paymentTerms}
              onPaymentTermsChange={setPaymentTerms}
              expectedDeliveryDate={expectedDeliveryDate}
              onExpectedDeliveryDateChange={setExpectedDeliveryDate}
              paymentInstallments={paymentInstallments}
              onPaymentInstallmentsChange={setPaymentInstallments}
              paymentDaysFirst={paymentDaysFirst}
              onPaymentDaysFirstChange={setPaymentDaysFirst}
              paymentDaysBetween={paymentDaysBetween}
              onPaymentDaysBetweenChange={setPaymentDaysBetween}
              deliveryDeadline={deliveryDeadline}
              onDeliveryDeadlineChange={setDeliveryDeadline}
              shippingType={shippingType}
              onShippingTypeChange={setShippingType}
              notes={notes}
              onNotesChange={setNotes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Itens do orçamento</CardTitle>
          </CardHeader>
          <CardContent>
            <QuoteItemsEditor
              lines={lines}
              onLinesChange={setLines}
              productCache={productCache}
              onProductCacheMerge={(patch) =>
                setProductCache((prev) => ({ ...prev, ...patch }))
              }
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/sales/quotes/${id}`)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}
