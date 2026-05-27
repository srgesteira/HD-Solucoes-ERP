"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  Pencil,
  Printer,
  FilePenLine,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { quoteStatusBadge } from "@/modules/vendas/lib/sales/quote-display";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type { QuoteStatus } from "@/modules/core/types/sales.types";
import { QuoteRejectModal } from "@/components/sales/quote-reject-modal";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import type { Tables } from "@/modules/core/types/database";

type ProductNested = { name?: string | null } | null;

type QuoteItemLine = {
  id: string;
  description: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  markup_percent?: number | null;
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
  status: string;
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
  body: { status: string; revision_notes?: string | null }
): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar estado");
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

  const invalidateQuote = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-quote", id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
  };

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

  const rejectMutation = useMutation({
    mutationFn: (p: { reasonIds: string[]; notes: string }) =>
      postRejectQuote(id, p.reasonIds, p.notes),
    onSuccess: () => {
      toast.success("Orçamento rejeitado.");
      setRejectOpen(false);
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/sales/quotes">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        {q ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(`/sales/quotes/${id}/print`, "_blank", "noopener,noreferrer")
            }
          >
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </Button>
        ) : null}
        {canEditQuotes && q && st === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push(`/sales/quotes/${id}/edit`)}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        ) : null}
        {canEditQuotes &&
        q &&
        (st === "sent" || st === "approved" || st === "revision") ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push(`/sales/quotes/${id}/edit`)}
          >
            <FilePenLine className="h-4 w-4" />
            Revisar
          </Button>
        ) : null}
        {isAdmin && q && st === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate({ status: "sent" as const })}
          >
            <Send className="h-4 w-4" />
            Enviar
          </Button>
        ) : null}
        {isAdmin && q && (st === "draft" || st === "sent") ? (
          <>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              <Check className="h-4 w-4" />
              Aprovar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={rejectMutation.isPending}
              onClick={() => setRejectOpen(true)}
            >
              <XCircle className="h-4 w-4" />
              Rejeitar
            </Button>
          </>
        ) : null}
      </div>

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
                      Orçamento {q.quote_number}
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
                      <span className="text-slate-500">
                        Data do orçamento:
                      </span>{" "}
                      <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {fmtDay(q.quote_date)}
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
                <CardTitle className="text-lg">Condições comerciais</CardTitle>
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
                  <p className="font-medium">{q.shipping_type ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          )}

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
                          {line.description ?? "—"}
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
    </div>
  );
}
