"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  FileText,
  Loader2,
  Pencil,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import type { QuoteStatus } from "@/lib/types/sales.types";
import { CompanyDocumentBranding } from "@/components/company/company-document-branding";
import type { Tables } from "@/lib/types/database";

type ProductNested = { name?: string | null } | null;

type QuoteItemLine = {
  id: string;
  description: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  total_price: number;
  product?: ProductNested | ProductNested[] | null;
};

type QuoteDetail = {
  id: string;
  quote_number: string;
  status: string;
  quote_date: string;
  valid_until: string | null;
  created_at: string;
  client_name: string;
  client_document: string | null;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
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

function statusBadge(status: string): { label: string; className: string } {
  switch (status as QuoteStatus) {
    case "draft":
      return {
        label: "Rascunho",
        className:
          "bg-slate-100 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-600",
      };
    case "sent":
      return {
        label: "Enviado",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700/50",
      };
    case "approved":
      return {
        label: "Aprovado",
        className:
          "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    case "rejected":
      return {
        label: "Rejeitado",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    case "converted":
      return {
        label: "Convertido",
        className:
          "bg-blue-50 text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
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

async function putQuoteStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar estado");
}

async function postConvertQuote(
  id: string,
  body: {
    payment_installments: number;
    payment_days_to_first_due: number;
    payment_days_between_installments: number;
  }
): Promise<string> {
  const res = await fetch(`/api/sales/quotes/${id}/convert`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao converter orçamento");
  const oid = json.data?.id;
  if (!oid) throw new Error("Pedido criado sem identificador");
  return oid;
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

async function fetchNextOrderSuggestion(): Promise<string> {
  const res = await fetch(`/api/sales/orders?suggest_number=1`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    suggestion?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao obter número sugerido");
  if (!json.suggestion || typeof json.suggestion !== "string")
    throw new Error("Sugestão inválida");
  return json.suggestion;
}

export default function QuoteDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

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

  const [convertOpen, setConvertOpen] = useState(false);
  const [payInst, setPayInst] = useState(1);
  const [payFirst, setPayFirst] = useState(30);
  const [payBetween, setPayBetween] = useState(30);

  const suggestionQuery = useQuery({
    queryKey: ["sales-order-suggest-number"],
    queryFn: fetchNextOrderSuggestion,
    enabled: convertOpen && isAdmin,
  });

  useEffect(() => {
    if (convertOpen) {
      setPayInst(1);
      setPayFirst(30);
      setPayBetween(30);
    }
  }, [convertOpen]);

  const invalidateQuote = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-quote", id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ status }: { status: string }) => putQuoteStatus(id, status),
    onSuccess: (_, v) => {
      const msg =
        v.status === "sent"
          ? "Orçamento marcado como enviado."
          : v.status === "approved"
            ? "Orçamento aprovado."
            : v.status === "rejected"
              ? "Orçamento rejeitado."
              : "Estado actualizado.";
      toast.success(msg);
      invalidateQuote();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      postConvertQuote(id, {
        payment_installments: payInst,
        payment_days_to_first_due: payFirst,
        payment_days_between_installments: payBetween,
      }),
    onSuccess: (orderId) => {
      toast.success("Orçamento convertido em pedido de venda.");
      setConvertOpen(false);
      invalidateQuote();
      router.push(`/sales/orders/${orderId}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sb = q ? statusBadge(q.status) : null;
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
        {isAdmin && q && (st === "draft" || st === "sent") ? (
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
        {isAdmin && q && st === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate({ status: "sent" })}
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
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ status: "approved" })}
            >
              <Check className="h-4 w-4" />
              Aprovar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ status: "rejected" })}
            >
              <XCircle className="h-4 w-4" />
              Rejeitar
            </Button>
          </>
        ) : null}
        {isAdmin &&
        q &&
        st === "approved" &&
        !q.converted_to_sale_id ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setConvertOpen(true)}
          >
            <ArrowRightLeft className="h-4 w-4" />
            Converter
          </Button>
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
              <div>
                <p className="text-slate-500">Nome</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {q.client_name}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Documento</p>
                <p className="font-medium">{q.client_document ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">E-mail</p>
                <p className="font-medium">{q.client_email ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">Telefone</p>
                <p className="font-medium">{q.client_phone ?? "—"}</p>
              </div>
            </CardContent>
          </Card>

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
                      Unitário
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
                          {fmtBRL(Number(line.unit_price))}
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

      {convertOpen && q && isAdmin ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-convert-detail-title"
          onClick={(e) => {
            if (
              e.target === e.currentTarget &&
              !convertMutation.isPending
            ) {
              setConvertOpen(false);
            }
          }}
        >
          <div
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="quote-convert-detail-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Converter em pedido de venda
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              O pedido será criado com os itens deste orçamento. O número é
              gerado automaticamente pelo sistema.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="conv-order-num">Número do pedido</Label>
                <Input
                  id="conv-order-num"
                  readOnly
                  className="mt-1 bg-slate-50 dark:bg-slate-900"
                  value={
                    suggestionQuery.isFetching || suggestionQuery.isPending
                      ? "A gerar…"
                      : suggestionQuery.isError
                        ? "—"
                        : (suggestionQuery.data ?? "—")
                  }
                />
                {suggestionQuery.isError ? (
                  <p className="mt-1 text-xs text-red-600">
                    {(suggestionQuery.error as Error)?.message ??
                      "Não foi possível obter o número sugerido."}
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="conv-inst">Parcelas</Label>
                <Input
                  id="conv-inst"
                  type="number"
                  min={1}
                  className="mt-1"
                  value={payInst}
                  onChange={(e) =>
                    setPayInst(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
              </div>
              <div>
                <Label htmlFor="conv-first">
                  Dias até à primeira parcela
                </Label>
                <Input
                  id="conv-first"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={payFirst}
                  onChange={(e) =>
                    setPayFirst(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                />
              </div>
              <div>
                <Label htmlFor="conv-between">
                  Dias entre parcelas
                </Label>
                <Input
                  id="conv-between"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={payBetween}
                  onChange={(e) =>
                    setPayBetween(
                      Math.max(0, parseInt(e.target.value, 10) || 0)
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={convertMutation.isPending}
                onClick={() => setConvertOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  convertMutation.isPending ||
                  suggestionQuery.isFetching ||
                  suggestionQuery.isPending ||
                  suggestionQuery.isError
                }
                onClick={() => convertMutation.mutate()}
              >
                {convertMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A processar…
                  </>
                ) : (
                  "Confirmar conversão"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
