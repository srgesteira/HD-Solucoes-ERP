"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileText,
  Loader2,
  Pencil,
  Printer,
  Save,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatQuoteDisplayTitle,
  formatQuoteNumberWithRevision,
  quoteStatusBadge,
} from "@/modules/vendas/lib/sales/quote-display";
import { quoteStatusAllowsContentEdit } from "@/modules/vendas/lib/sales/quote-access";
import { inferDeliveryBusinessDaysFromQuote } from "@/modules/vendas/lib/sales/quote-delivery";
import {
  itemsToLinesAndCache,
  type QuoteApiItem,
} from "@/modules/vendas/lib/sales/quote-form-hydrate";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type { QuoteStatus } from "@/modules/core/types/sales.types";
import { QuoteRejectModal } from "@/components/sales/quote-reject-modal";
import { QuoteSendEmailModal } from "@/components/sales/quote-send-email-modal";
import { AuditHistoryPanel } from "@/components/audit/audit-history-panel";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import { QuoteFormFields } from "@/components/sales/quote-form-fields";
import type { CustomerOption } from "@/components/sales/customer-quick-create-modal";
import {
  QuoteItemsEditor,
  buildQuoteItemsPayload,
  newQuoteLine,
  type QuoteLineDraft,
  type QuoteLineProduct,
} from "@/components/sales/quote-items-editor";
import type { Tables } from "@/modules/core/types/database";

type ProductNested = {
  id?: string;
  name?: string | null;
  cost_price?: number | null;
  unit?: string | null;
  technical_code?: string | null;
  code?: string | null;
} | null;

type QuoteItemLine = QuoteApiItem & {
  id: string;
  description: string | null;
  total_price: number;
  product?: ProductNested | ProductNested[] | null;
};

type CustomerNested = {
  id?: string;
  name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
} | null;

type QuoteDetail = {
  id: string;
  quote_number: string;
  revision_number?: number | null;
  status: string;
  customer_id: string | null;
  quote_date: string;
  valid_until: string | null;
  validity_days: number | null;
  payment_terms: string | null;
  expected_delivery_date: string | null;
  payment_installments: number | null;
  payment_days_to_first_due: number | null;
  payment_days_between_installments: number | null;
  delivery_deadline: string | null;
  shipping_type: string | null;
  freight_cost?: number | null;
  created_at: string;
  client_name: string;
  client_email: string | null;
  customer?: CustomerNested | CustomerNested[];
  notes: string | null;
  revision_notes: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  converted_to_sale_id: string | null;
  awaiting_commercial_finalize?: boolean | null;
  items?: QuoteItemLine[] | null;
  converted_sale?: unknown;
};

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(n ?? 0));
}

function fmtDay(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function unwrapProduct(p: QuoteItemLine["product"]): string {
  if (p == null) return "—";
  const o = Array.isArray(p) ? p[0] : p;
  if (!o || typeof o !== "object") return "—";
  const n = "name" in o ? o.name : null;
  return typeof n === "string" && n.trim() ? n : "—";
}

function unwrapConvertedSale(
  cs: unknown
): { id: string; order_number: string } | null {
  if (cs == null) return null;
  const o = Array.isArray(cs) ? cs[0] : cs;
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : "";
  const order_number =
    typeof rec.order_number === "string" ? rec.order_number : "";
  if (!id) return null;
  return { id, order_number };
}

function seedCustomerFromQuote(q: QuoteDetail): CustomerOption | null {
  const c = Array.isArray(q.customer) ? q.customer[0] : q.customer;
  if (c?.id && c?.name) {
    return {
      id: c.id,
      name: c.name,
      document: c.document ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
    };
  }
  if (q.customer_id) {
    return {
      id: q.customer_id,
      name: q.client_name || "Cliente",
      document: null,
      email: null,
      phone: null,
    };
  }
  return null;
}

async function fetchQuoteDetail(id: string): Promise<{ data: QuoteDetail }> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar orçamento");
  if (!json.data || typeof json.data !== "object")
    throw new Error("Resposta inválida");
  return { data: json.data as QuoteDetail };
}

async function putQuoteUpdate(
  id: string,
  body: Record<string, unknown>
): Promise<QuoteDetail> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: QuoteDetail;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar orçamento");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function postApproveQuote(id: string): Promise<string> {
  const res = await fetch(`/api/sales/quotes/${id}/approve`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { sales_order_id?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao aprovar orçamento");
  const oid = json.data?.sales_order_id;
  if (!oid) throw new Error("Pedido criado sem identificador");
  return oid;
}

async function postSendQuoteEmail(
  id: string,
  to: string[],
  message: string | null
): Promise<{ sent: boolean; simulated: boolean; message: string | null }> {
  const res = await fetch(`/api/sales/quotes/${id}/send-email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, message }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    sent?: boolean;
    simulated?: boolean;
    message?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao enviar orçamento");
  return {
    sent: Boolean(json.sent),
    simulated: Boolean(json.simulated),
    message: json.message ?? null,
  };
}

async function postRejectQuote(
  id: string,
  reasonIds: string[],
  notes: string
): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}/reject`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason_ids: reasonIds, notes: notes || null }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao rejeitar orçamento");
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

export default function QuoteDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEditQuotes = isAdmin || can("sales");

  const quoteQuery = useQuery({
    queryKey: ["sales-quote", id],
    queryFn: () => fetchQuoteDetail(id),
    enabled: Boolean(id),
  });

  const companyBrandingQuery = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanyBranding,
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const q = quoteQuery.data?.data;

  const [rejectOpen, setRejectOpen] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [quoteDate, setQuoteDate] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryBusinessDays, setDeliveryBusinessDays] = useState("");
  const [shippingType, setShippingType] = useState("FOB");
  const [freightCost, setFreightCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLineDraft[]>(() => [newQuoteLine(0)]);
  const [productCache, setProductCache] = useState<
    Record<string, QuoteLineProduct>
  >({});
  const structureAckRef = useRef(false);

  const canContentEdit =
    Boolean(q) &&
    canEditQuotes &&
    quoteStatusAllowsContentEdit(q!.status);

  // Estados em que iniciar uma edição deve incrementar revisão (princípio §2.4).
  const editingTriggersRevision =
    Boolean(q) && (q!.status === "sent" || q!.status === "approved");

  useEffect(() => {
    setEditing(false);
    setHydrated(false);
    structureAckRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!q || !editing || !canContentEdit || hydrated) return;
    setCustomerId(q.customer_id ?? "");
    setClientEmail(q.client_email ?? "");
    setQuoteDate(String(q.quote_date ?? "").slice(0, 10));
    setValidityDays(String(q.validity_days ?? 30));
    setPaymentTerms(q.payment_terms ?? "");
    setDeliveryBusinessDays(inferDeliveryBusinessDaysFromQuote(q));
    setShippingType(q.shipping_type ?? "FOB");
    setFreightCost(Number(q.freight_cost ?? 0));
    setNotes(q.notes ?? "");
    const apiItems = Array.isArray(q.items) ? q.items : [];
    const { lines: loadedLines, cache } = itemsToLinesAndCache(apiItems);
    setLines(loadedLines);
    setProductCache(cache);
    setHydrated(true);
  }, [q, editing, canContentEdit, hydrated]);

  useEffect(() => {
    if (
      !id ||
      !q?.awaiting_commercial_finalize ||
      structureAckRef.current ||
      !editing ||
      !canContentEdit
    ) {
      return;
    }
    structureAckRef.current = true;
    toast.info(
      "A engenharia concluiu a estrutura. Os custos foram actualizados — reveja markup e preços."
    );
    void (async () => {
      await fetch(`/api/sales/quotes/${id}/acknowledge-structure`, {
        method: "POST",
        credentials: "include",
      });
      await queryClient.invalidateQueries({ queryKey: ["sales-quote", id] });
      await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
      const fresh = await fetchQuoteDetail(id);
      const apiItems = Array.isArray(fresh.data.items) ? fresh.data.items : [];
      const { lines: loadedLines, cache } = itemsToLinesAndCache(apiItems);
      setLines(loadedLines);
      setProductCache(cache);
    })();
  }, [id, q?.awaiting_commercial_finalize, editing, canContentEdit, queryClient]);

  const productById = useMemo(() => {
    const map = new Map<string, QuoteLineProduct>();
    for (const p of Object.values(productCache)) map.set(p.id, p);
    return map;
  }, [productCache]);

  const seedCustomer = q ? seedCustomerFromQuote(q) : null;

  const invalidateQuote = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-quote", id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!customerId.trim()) throw new Error("Selecione um cliente.");
      const vd = parseInt(validityDays.trim(), 10);
      if (!Number.isFinite(vd) || vd < 1) {
        throw new Error("Validade em dias deve ser ≥ 1.");
      }
      const itemsResult = buildQuoteItemsPayload(lines, productById);
      if ("error" in itemsResult) throw new Error(itemsResult.error);

      const deliveryDaysRaw = deliveryBusinessDays.trim();
      const deliveryDaysParsed = deliveryDaysRaw
        ? parseInt(deliveryDaysRaw, 10)
        : null;

      return putQuoteUpdate(id, {
        customer_id: customerId.trim(),
        client_email: clientEmail.trim() || null,
        quote_date: quoteDate.slice(0, 10),
        validity_days: vd,
        payment_terms: paymentTerms.trim() || null,
        delivery_business_days:
          deliveryDaysParsed != null && Number.isFinite(deliveryDaysParsed)
            ? deliveryDaysParsed
            : null,
        shipping_type: shippingType,
        freight_cost: shippingType === "CIF" ? freightCost : 0,
        notes: notes.trim() || null,
        items: itemsResult,
      });
    },
    onSuccess: (updated) => {
      const rev = Number(updated.revision_number ?? 0);
      const label = formatQuoteNumberWithRevision(updated.quote_number, rev);
      toast.success(
        rev > 0
          ? `Orçamento actualizado (${label}).`
          : "Orçamento actualizado."
      );
      setEditing(false);
      setHydrated(false);
      invalidateQuote();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: (body: { status: string; revision_notes?: string | null }) =>
      putQuoteUpdate(id, body),
    onSuccess: (_, v) => {
      const msg =
        v.status === "sent"
          ? "Orçamento marcado como enviado."
          : v.status === "approved"
            ? "Orçamento aprovado."
            : v.status === "rejected"
              ? "Orçamento rejeitado."
              : v.status === "revision"
                ? "Orçamento em revisão."
                : v.status === "draft"
                  ? "Orçamento reaberto como rascunho."
                  : "Estado actualizado.";
      toast.success(msg);
      setHydrated(false);
      invalidateQuote();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: () => postApproveQuote(id),
    onSuccess: (orderId) => {
      toast.success("Orçamento aprovado e pedido de venda criado.");
      invalidateQuote();
      router.push(`/sales/orders/${orderId}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendEmailMutation = useMutation({
    mutationFn: (p: { to: string[]; message: string | null }) =>
      postSendQuoteEmail(id, p.to, p.message),
    onSuccess: (result) => {
      if (result.sent) {
        toast.success(result.message ?? "Orçamento enviado por e-mail.");
      } else if (result.simulated) {
        toast.info(
          result.message ??
            "Envio simulado — configure o serviço de e-mail (RESEND_API_KEY)."
        );
      } else {
        toast.warning(result.message ?? "Envio não confirmado.");
      }
      setSendEmailOpen(false);
      invalidateQuote();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (p: { reasonIds: string[]; notes: string }) =>
      postRejectQuote(id, p.reasonIds, p.notes),
    onSuccess: () => {
      toast.success("Orçamento rejeitado.");
      setRejectOpen(false);
      setHydrated(false);
      invalidateQuote();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sb = q ? quoteStatusBadge(q.status) : null;
  const st = (q?.status ?? "") as QuoteStatus;
  const convertedSale = q ? unwrapConvertedSale(q.converted_sale) : null;
  const saleId =
    convertedSale?.id ??
    (q?.converted_to_sale_id ? q.converted_to_sale_id : null);
  const saleHref = saleId ? `/sales/orders/${saleId}` : null;
  const busy =
    saveMutation.isPending ||
    statusMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    sendEmailMutation.isPending;

  return (
    <AppPage
      backHref="/sales/quotes"
      title={
        q
          ? formatQuoteDisplayTitle(q.quote_number, q.revision_number)
          : "Orçamento"
      }
      density="comfortable"
      actions={
        <>
          {q ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `/sales/quotes/${id}/print`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </Button>
          ) : null}
          {canContentEdit && !editing ? (
            <Button
              type="button"
              size="sm"
              variant={editingTriggersRevision ? "outline" : "primary"}
              className={
                editingTriggersRevision
                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  : undefined
              }
              disabled={busy}
              onClick={() => {
                if (editingTriggersRevision) {
                  const ok = window.confirm(
                    "Editar este orçamento criará uma nova revisão (rev seguinte). Continuar?"
                  );
                  if (!ok) return;
                }
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              {editingTriggersRevision ? "Editar (cria revisão)" : "Editar"}
            </Button>
          ) : null}
          {canContentEdit && editing ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setHydrated(false);
                }}
              >
                <X className="h-4 w-4" />
                Cancelar edição
              </Button>
            </>
          ) : null}
          {canEditQuotes &&
          q &&
          !editing &&
          (st === "draft" || st === "revision" || st === "sent") ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setSendEmailOpen(true)}
            >
              <Send className="h-4 w-4" />
              {st === "sent" ? "Reenviar" : "Enviar"}
            </Button>
          ) : null}
          {isAdmin && q && (st === "draft" || st === "sent") ? (
            <>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={busy}
                onClick={() => approveMutation.mutate()}
              >
                <Check className="h-4 w-4" />
                Aprovar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4" />
                Rejeitar
              </Button>
            </>
          ) : null}
        </>
      }
    >

      {quoteQuery.isLoading ? (
        <div className="flex items-center gap-2 text-slate-600 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : quoteQuery.error ? (
        <p className="text-red-700 text-sm">
          {quoteQuery.error instanceof Error
            ? quoteQuery.error.message
            : "Erro ao carregar"}
        </p>
      ) : q ? (
        <>
          <CompanyDocumentBranding
            settings={companyBrandingQuery.data ?? null}
            documentLabel="Orçamento comercial"
          />
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-xl sm:text-2xl font-semibold">
                      {formatQuoteDisplayTitle(
                        q.quote_number,
                        q.revision_number,
                      )}
                    </CardTitle>
                    {sb ? (
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2.5 py-0.5 text-xs font-medium",
                          sb.className
                        )}
                      >
                        {sb.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>
                      <span className="text-slate-500">Registado:</span>{" "}
                      <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {fmtDay(q.created_at)}
                      </span>
                    </span>
                    <span>
                      <span className="text-slate-500">Data do orçamento:</span>{" "}
                      <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {editing && hydrated
                          ? fmtDay(quoteDate)
                          : fmtDay(q.quote_date)}
                      </span>
                    </span>
                    <span>
                      <span className="text-slate-500">Validade:</span>{" "}
                      <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {fmtDay(q.valid_until)}
                        {q.validity_days != null
                          ? ` (${q.validity_days} dias)`
                          : ""}
                      </span>
                    </span>
                  </div>
                </div>
                {saleHref ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/35">
                    <p className="text-slate-600 dark:text-slate-400">
                      Convertido para pedido de venda
                    </p>
                    <Link
                      href={saleHref}
                      className="font-semibold text-brand-700 hover:underline dark:text-brand-400"
                    >
                      {convertedSale?.order_number
                        ? `Pedido ${convertedSale.order_number}`
                        : "Ver pedido de venda"}
                    </Link>
                  </div>
                ) : null}
              </div>
            </CardHeader>
          </Card>

          {q.revision_notes?.trim() ? (
            <Card className="border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-orange-900 dark:text-orange-100">
                  Motivo da revisão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-orange-950 dark:text-orange-100 whitespace-pre-wrap">
                  {q.revision_notes.trim()}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {editing && canContentEdit && !hydrated ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              A preparar edição…
            </div>
          ) : null}

          {editing && canContentEdit && editingTriggersRevision && hydrated ? (
            <Card className="border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30">
              <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-100">
                <strong>Aviso:</strong> ao guardar, será criada uma nova
                revisão deste orçamento (o número receberá o sufixo da próxima
                revisão).
              </CardContent>
            </Card>
          ) : null}

          {editing && canContentEdit && hydrated ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados do orçamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <QuoteFormFields
                    quoteNumber={q.quote_number}
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
                    deliveryBusinessDays={deliveryBusinessDays}
                    onDeliveryBusinessDaysChange={setDeliveryBusinessDays}
                    shippingType={shippingType}
                    onShippingTypeChange={setShippingType}
                    freightCost={freightCost}
                    onFreightCostChange={setFreightCost}
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
                    sourceQuoteId={id}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar alterações
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-600" />
                    Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
                  {(() => {
                    const cust = Array.isArray(q.customer)
                      ? q.customer[0]
                      : q.customer;
                    return (
                      <>
                        <div>
                          <p className="text-slate-500">Nome</p>
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {cust?.name ?? q.client_name}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Documento</p>
                          <p className="font-medium">{cust?.document ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">E-mail (orçamento)</p>
                          <p className="font-medium">{q.client_email ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Telefone</p>
                          <p className="font-medium">{cust?.phone ?? "—"}</p>
                        </div>
                        {cust?.address ? (
                          <div className="sm:col-span-2">
                            <p className="text-slate-500">Endereço</p>
                            <p className="font-medium">{cust.address}</p>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {(q.payment_terms ||
                q.expected_delivery_date ||
                q.delivery_deadline ||
                q.shipping_type) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Condições comerciais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="text-slate-500">Pagamento (texto)</p>
                      <p className="font-medium">{q.payment_terms ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Entrega prevista (data)</p>
                      <p className="font-medium tabular-nums">
                        {q.expected_delivery_date
                          ? String(q.expected_delivery_date).slice(0, 10)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Parcelas</p>
                      <p className="font-medium tabular-nums">
                        {q.payment_installments ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Dias até 1.ª parcela</p>
                      <p className="font-medium tabular-nums">
                        {q.payment_days_to_first_due ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Dias entre parcelas</p>
                      <p className="font-medium tabular-nums">
                        {q.payment_days_between_installments ?? "—"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-slate-500">Prazo de entrega (texto)</p>
                      <p className="font-medium">{q.delivery_deadline ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Frete</p>
                      <p className="font-medium">
                        {q.shipping_type ?? "—"}
                        {q.shipping_type === "CIF" &&
                        Number(q.freight_cost ?? 0) > 0
                          ? ` — ${Number(q.freight_cost).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}`
                          : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Itens</CardTitle>
                </CardHeader>
                <CardContent className="rounded-lg border border-slate-200 overflow-x-auto dark:border-slate-800">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50">
                        <th className="px-3 py-2 text-left font-medium">
                          Produto
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Descrição
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Quantidade
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Preço unitário
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(q.items) && q.items.length > 0 ? (
                        q.items.map((line) => (
                          <tr
                            key={line.id}
                            className="border-b border-slate-100 dark:border-slate-800"
                          >
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {unwrapProduct(line.product)}
                            </td>
                            <td className="px-3 py-2">
                              <span>{line.description ?? "—"}</span>
                              {line.client_notes?.trim() ? (
                                <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">
                                  Obs. cliente: {line.client_notes.trim()}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {Number(line.quantity)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className="font-medium">
                                {fmtBRL(Number(line.unit_price))}
                              </span>
                              {line.markup_percent != null ? (
                                <span className="block text-xs text-slate-500 font-normal">
                                  ({Number(line.markup_percent)}% markup)
                                </span>
                              ) : (
                                <span className="block text-xs text-slate-500 font-normal">
                                  (preço manual)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {fmtBRL(Number(line.total_price))}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-6 text-center text-slate-500"
                          >
                            Sem itens registados neste orçamento.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Totais</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="tabular-nums font-medium">
                        {fmtBRL(q.subtotal)}
                      </span>
                    </div>
                    {q.discount > 0 ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Desconto</span>
                        <span className="tabular-nums font-medium text-red-700 dark:text-red-400">
                          − {fmtBRL(q.discount)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Imposto</span>
                      <span className="tabular-nums font-medium">
                        {fmtBRL(q.tax)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 mt-2 dark:border-slate-700">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Total final
                      </span>
                      <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {fmtBRL(q.total)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Observações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {q.notes?.trim() ? q.notes : "—"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-5">
                  <AuditHistoryPanel table="quotes" recordId={id} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : null}

      <QuoteRejectModal
        open={rejectOpen}
        quoteNumber={q?.quote_number ?? ""}
        busy={rejectMutation.isPending}
        onClose={() => !rejectMutation.isPending && setRejectOpen(false)}
        onSubmit={(reasonIds, notes) =>
          rejectMutation.mutate({ reasonIds, notes })
        }
      />

      <QuoteSendEmailModal
        open={sendEmailOpen}
        quoteNumber={
          q
            ? formatQuoteNumberWithRevision(q.quote_number, q.revision_number)
            : ""
        }
        defaultRecipient={
          q?.client_email?.trim() ||
          (Array.isArray(q?.customer)
            ? q?.customer?.[0]?.email
            : q?.customer?.email) ||
          ""
        }
        busy={sendEmailMutation.isPending}
        onClose={() =>
          !sendEmailMutation.isPending && setSendEmailOpen(false)
        }
        onSubmit={(to, message) => sendEmailMutation.mutate({ to, message })}
      />
    </AppPage>
  );
}
