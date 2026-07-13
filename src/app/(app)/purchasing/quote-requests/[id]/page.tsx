"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileText,
  Loader2,
  Mail,
  Printer,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { NumericInput } from "@/shared/ui/numeric-input";
import { formatShortDate } from "@/shared/utils/date";
import { fmtBRL } from "@/shared/utils/format-brl";
import { cn } from "@/shared/utils/cn";
import { SupplierSelectField } from "@/components/purchasing/supplier-select-field";
import type { SupplierOption } from "@/components/purchasing/supplier-quick-create-modal";
import { SUPPLIERS_ACTIVE_QUERY_KEY } from "@/modules/compras/lib/suppliers/query-keys";
import { quoteRequestsQueryKey } from "@/components/purchasing/request-quote-tab";
import {
  purchaseQuoteRequestStatusLabel,
  type PurchaseQuoteRequestDetail,
} from "@/modules/compras/lib/purchasing/request-purchase-quote";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

async function fetchRequest(id: string): Promise<PurchaseQuoteRequestDetail> {
  const res = await fetch(`/api/purchasing/quote-requests/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: PurchaseQuoteRequestDetail;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar solicitação");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function fetchActiveSuppliers(): Promise<SupplierOption[]> {
  const params = new URLSearchParams({
    is_active: "true",
    limit: "500",
    page: "1",
  });
  const res = await fetch(`/api/purchasing/suppliers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: SupplierOption[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar fornecedores");
  return (json.data ?? []).map((row) => ({
    id: row.id,
    code: row.code ?? "",
    name: row.name ?? "",
    document: row.document ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
  }));
}

export default function PurchaseQuoteRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = typeof params.id === "string" ? params.id : "";

  const [convertOpen, setConvertOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});

  const requestQ = useQuery({
    queryKey: ["purchasing-quote-request", id],
    queryFn: () => fetchRequest(id),
    enabled: Boolean(id),
  });

  const suppliersQ = useQuery({
    queryKey: [...SUPPLIERS_ACTIVE_QUERY_KEY, "quote-convert"],
    queryFn: fetchActiveSuppliers,
    enabled: convertOpen,
    staleTime: 60_000,
  });

  const request = requestQ.data;
  const canConvert =
    request &&
    (request.status === "draft" || request.status === "sent") &&
    !request.converted_to_purchase_order_id;

  const openConvert = () => {
    if (!request) return;
    const next: Record<string, number> = {};
    for (const item of request.items) {
      next[item.id] = Number(item.unit_price ?? 0);
    }
    setPrices(next);
    setSupplierId("");
    setConvertOpen(true);
  };

  const convertMut = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Seleccione o fornecedor.");
      const res = await fetch(`/api/purchasing/quote-requests/${id}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          lines: Object.entries(prices).map(([item_id, unit_price]) => ({
            item_id,
            unit_price,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { purchase_order_id: string; po_number: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar pedido");
      return json.data!;
    },
    onSuccess: (data) => {
      toast.success(`Pedido de compra ${data.po_number} criado.`);
      setConvertOpen(false);
      void qc.invalidateQueries({ queryKey: quoteRequestsQueryKey });
      void qc.invalidateQueries({ queryKey: ["purchasing-quote-request", id] });
      router.push(`/purchasing/orders/${data.purchase_order_id}`);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao gerar pedido"),
  });

  const markSentMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/purchasing/quote-requests/${id}/mark-sent`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar estado");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["purchasing-quote-request", id] });
      void qc.invalidateQueries({ queryKey: quoteRequestsQueryKey });
    },
  });

  const statusBadge = useMemo(() => {
    if (!request) return null;
    const label = purchaseQuoteRequestStatusLabel(request.status);
    const cls =
      request.status === "converted"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : request.status === "sent"
          ? "bg-blue-50 text-blue-800 ring-blue-200"
          : request.status === "cancelled"
            ? "bg-slate-100 text-slate-600 ring-slate-200"
            : "bg-amber-50 text-amber-900 ring-amber-200";
    return (
      <span
        className={cn(
          "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1",
          cls
        )}
      >
        {label}
      </span>
    );
  }, [request]);

  if (requestQ.isLoading) {
    return (
      <AppPage title="Solicitação de orçamento" backHref="/purchasing/orders?tab=request-quote">
        <div className="flex items-center justify-center gap-2 py-24 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      </AppPage>
    );
  }

  if (requestQ.error || !request) {
    return (
      <AppPage title="Solicitação de orçamento" backHref="/purchasing/orders?tab=request-quote">
        <p className="text-center text-red-700 text-sm py-12">
          {requestQ.error instanceof Error
            ? requestQ.error.message
            : "Solicitação não encontrada"}
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={`Solicitação ${request.request_number}`}
      description="Fluxo igual a vendas: orçamento → pedido de compra."
      backHref="/purchasing/orders?tab=request-quote"
      width="wide"
      density="comfortable"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(`/purchasing/quote-requests/${id}/print`, "_blank")
            }
          >
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              window.open(`/purchasing/quote-requests/${id}/print`, "_blank");
              if (request.status === "draft") {
                markSentMut.mutate();
              }
            }}
          >
            <Mail className="h-4 w-4" />
            Enviar (PDF / e-mail)
          </Button>
          {canConvert ? (
            <Button type="button" size="sm" onClick={openConvert}>
              <ShoppingCart className="h-4 w-4" />
              Gerar pedido de compra
            </Button>
          ) : null}
        </>
      }
    >
      {request.converted_to_purchase_order_id ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Convertida em pedido de compra{" "}
          <Link
            href={`/purchasing/orders/${request.converted_to_purchase_order_id}`}
            className="font-semibold underline"
          >
            {request.converted_po_number ?? "abrir PC"}
          </Link>
          .
        </div>
      ) : null}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-600" />
              Dados da solicitação
              {statusBadge}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Número</p>
              <p className="font-medium">{request.request_number}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Data</p>
              <p className="font-medium">{formatDate(request.request_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Necessidade</p>
              <p className="font-medium">{formatDate(request.need_date)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">Mensagem</p>
              <p className="whitespace-pre-wrap">
                {request.message?.trim() || "—"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">Observações</p>
              <p className="whitespace-pre-wrap">
                {request.notes?.trim() || "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Itens</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-2 pr-2">Código</th>
                  <th className="py-2 pr-2">Descrição</th>
                  <th className="py-2 pr-2 text-right">Qtd</th>
                  <th className="py-2">Un.</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-mono text-xs">
                      {item.product?.technical_code?.trim() ||
                        item.product?.code?.trim() ||
                        "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {item.product?.name?.trim() || item.description}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-2">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {convertOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">
                Gerar pedido de compra
              </h2>
              <p className="text-sm text-slate-600">
                Informe o fornecedor e os preços cotados. O PC abre em rascunho
                para conferência.
              </p>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
              <SupplierSelectField
                value={supplierId}
                onChange={setSupplierId}
                suppliers={suppliersQ.data ?? []}
                loading={suppliersQ.isLoading}
                emptyOptionLabel="Seleccione o fornecedor"
                onSupplierCreated={(s) => {
                  setSupplierId(s.id);
                  void qc.invalidateQueries({
                    queryKey: SUPPLIERS_ACTIVE_QUERY_KEY,
                  });
                }}
              />
              <div className="space-y-2">
                <Label>Preços unitários (opcional — pode ajustar no PC)</Label>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500">
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2 w-24">Qtd</th>
                        <th className="px-2 py-2 w-36">Preço un.</th>
                        <th className="px-2 py-2 w-28 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.items.map((item) => {
                        const price = prices[item.id] ?? 0;
                        return (
                          <tr key={item.id} className="border-t">
                            <td className="px-2 py-2">
                              <p className="font-medium">
                                {item.product?.name?.trim() || item.description}
                              </p>
                              <p className="font-mono text-xs text-slate-500">
                                {item.product?.technical_code?.trim() || "—"}
                              </p>
                            </td>
                            <td className="px-2 py-2 tabular-nums">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="px-2 py-2">
                              <NumericInput
                                value={price}
                                onChange={(n) =>
                                  setPrices((prev) => ({
                                    ...prev,
                                    [item.id]: Number.isFinite(n) ? n : 0,
                                  }))
                                }
                                maxDecimals={4}
                              />
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {fmtBRL(item.quantity * price)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConvertOpen(false)}
                disabled={convertMut.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={convertMut.isPending || !supplierId}
                onClick={() => convertMut.mutate()}
              >
                {convertMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Confirmar e abrir PC
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}
