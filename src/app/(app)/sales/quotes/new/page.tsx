"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Save } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import { useMe } from "@/hooks/use-me";
import {
  QuoteCommercialFields,
  QuoteFormFields,
} from "@/components/sales/quote-form-fields";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import {
  QuoteItemsEditor,
  buildQuoteItemsPayload,
  newQuoteLine,
  type QuoteLineDraft,
  type QuoteLineProduct,
} from "@/components/sales/quote-items-editor";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchSuggestion(): Promise<string> {
  const res = await fetch("/api/sales/quotes?suggest_number=1", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    suggestion?: string;
    error?: string;
  };
  if (!res.ok)
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao sugerir número"
    );
  if (!json.suggestion?.trim()) throw new Error("Resposta inválida");
  return json.suggestion.trim();
}

type CreateQuoteResponse = {
  data?: { id?: string; quote_number?: string };
  error?: string;
  detail?: unknown;
};

async function createQuote(
  payload: Record<string, unknown>
): Promise<CreateQuoteResponse["data"]> {
  const res = await fetch("/api/sales/quotes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as CreateQuoteResponse;
  if (!res.ok) {
    console.error("[createQuote] falhou", {
      status: res.status,
      error: json.error,
      detail: json.detail,
      payload,
    });
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao criar orçamento"
    );
  }
  return json.data;
}

export default function NewQuotePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [quoteNumber, setQuoteNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [quoteDate, setQuoteDate] = useState(todayISODate);
  const [validityDays, setValidityDays] = useState("30");
  const [paymentInstallments, setPaymentInstallments] = useState("1");
  const [paymentDaysFirst, setPaymentDaysFirst] = useState("30");
  const [paymentDaysBetween, setPaymentDaysBetween] = useState("30");
  const [deliveryBusinessDays, setDeliveryBusinessDays] = useState("");
  const [shippingType, setShippingType] = useState("FOB");
  const [freightCost, setFreightCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLineDraft[]>(() => [newQuoteLine(0)]);
  const [productCache, setProductCache] = useState<
    Record<string, QuoteLineProduct>
  >({});

  const isAdmin = me?.role === "admin";
  const canUseForm = !meLoading && isAdmin;

  const suggestionQuery = useQuery({
    queryKey: ["sales-quotes", "suggest-number"],
    queryFn: fetchSuggestion,
    enabled: canUseForm,
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    const s = suggestionQuery.data?.trim();
    if (!s) return;
    setQuoteNumber((prev) => (prev.trim() === "" ? s : prev));
  }, [suggestionQuery.data]);

  useEffect(() => {
    if (meLoading) return;
    if (!me || me.role !== "admin") {
      toast.error("Apenas administradores podem criar orçamentos.");
      router.replace("/sales/quotes");
    }
  }, [me, meLoading, router]);

  const productById = useMemo(() => {
    const map = new Map<string, QuoteLineProduct>();
    for (const p of Object.values(productCache)) map.set(p.id, p);
    return map;
  }, [productCache]);

  const mutation = useMutation({
    mutationFn: createQuote,
    onSuccess: async (data) => {
      toast.success(
        data?.quote_number
          ? `Orçamento ${data.quote_number} criado.`
          : "Orçamento criado."
      );
      await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
      router.push(
        data?.id ? `/sales/quotes/${data.id}` : "/sales/quotes"
      );
    },
    onError: (err: Error) => {
      console.error("[createQuote] mutation", err);
      toast.error(err.message || "Não foi possível criar o orçamento.");
    },
  });

  const handleSuggestionRefresh = () => {
    void suggestionQuery.refetch().then((res) => {
      const next = typeof res.data === "string" ? res.data.trim() : "";
      if (next) setQuoteNumber(next);
    });
  };

  const handleSubmit = async () => {
    if (!isAdmin) return;

    const qn = quoteNumber.trim();
    if (!qn) {
      toast.error("O número do orçamento é obrigatório.");
      return;
    }
    if (!customerId.trim()) {
      toast.error("Selecione um cliente.");
      return;
    }

    const qd = quoteDate.trim();
    if (!qd) {
      toast.error("Indique a data do orçamento.");
      return;
    }
    const vd = parseInt(validityDays.trim(), 10);
    if (!Number.isFinite(vd) || vd < 1) {
      toast.error("Validade em dias deve ser ≥ 1.");
      return;
    }

    const itemsResult = buildQuoteItemsPayload(lines, productById);
    if ("error" in itemsResult) {
      toast.error(itemsResult.error);
      return;
    }

    const deliveryDaysRaw = deliveryBusinessDays.trim();
    const deliveryDaysParsed = deliveryDaysRaw
      ? parseInt(deliveryDaysRaw, 10)
      : null;

    const payload = {
      quote_number: qn,
      customer_id: customerId.trim(),
      client_email: clientEmail.trim() || null,
      quote_date: qd.slice(0, 10),
      validity_days: vd,
      payment_installments: parseInt(paymentInstallments, 10) || 1,
      payment_days_to_first_due: parseInt(paymentDaysFirst, 10) || 0,
      payment_days_between_installments:
        paymentDaysBetween.trim() === ""
          ? 0
          : parseInt(paymentDaysBetween, 10) || 0,
      delivery_business_days:
        deliveryDaysParsed != null && Number.isFinite(deliveryDaysParsed)
          ? deliveryDaysParsed
          : null,
      shipping_type: shippingType,
      freight_cost: shippingType === "CIF" ? freightCost : 0,
      notes: notes.trim() || null,
      items: itemsResult,
    };

    console.log("[NewQuotePage] payload antes do POST", payload);

    try {
      await mutation.mutateAsync(payload);
    } catch {
      /* toast em onError */
    }
  };

  if (meLoading || !me || !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto flex justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <AppPage
      title="Novo orçamento"
      backHref="/sales/quotes"
      width="wide"
      density="comfortable"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={suggestionQuery.isFetching}
          onClick={handleSuggestionRefresh}
        >
          {suggestionQuery.isFetching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              …
            </>
          ) : (
            "Nova sugestão de número"
          )}
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-600" aria-hidden />
              Dados do orçamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {suggestionQuery.isError ? (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100">
                Não foi possível gerar automaticamente o número. Preencha no formato{" "}
                <strong className="font-medium">ORC-AAAA-NNNN</strong>.
              </p>
            ) : null}
            <QuoteFormFields
              quoteNumber={quoteNumber}
              onQuoteNumberChange={setQuoteNumber}
              customerId={customerId}
              onCustomerIdChange={setCustomerId}
              clientEmail={clientEmail}
              onClientEmailChange={setClientEmail}
              quoteDate={quoteDate}
              onQuoteDateChange={setQuoteDate}
              validityDays={validityDays}
              onValidityDaysChange={setValidityDays}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">
              Condições comerciais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuoteCommercialFields
              paymentInstallments={paymentInstallments}
              onPaymentInstallmentsChange={setPaymentInstallments}
              paymentDaysFirst={paymentDaysFirst}
              onPaymentDaysFirstChange={setPaymentDaysFirst}
              paymentDaysBetween={paymentDaysBetween}
              onPaymentDaysBetweenChange={setPaymentDaysBetween}
              deliveryBusinessDays={deliveryBusinessDays}
              onDeliveryBusinessDaysChange={setDeliveryBusinessDays}
              shippingType={shippingType}
              onShippingTypeChange={setShippingType}
              freightCost={freightCost}
              onFreightCostChange={setFreightCost}
              quoteDate={quoteDate}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">
              Itens do orçamento
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Apenas produtos acabados (HD1, HD2, HD3, AC). Defina o preço por markup
              (%) ou por valor unitário fixo (R$).
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">
              Observações gerais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="quote-notes">Observações</Label>
              <Textarea
                id="quote-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Notas internas ou condições que apareçam junto ao orçamento…"
                className="resize-y min-h-[88px]"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 justify-end">
          <Link href="/sales/quotes">
            <Button type="button" variant="outline" size="sm">
              Cancelar
            </Button>
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => void handleSubmit()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A guardar…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </div>
    </AppPage>
  );
}
