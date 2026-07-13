"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { BrDateInput } from "@/shared/ui/br-date-input";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaLoading,
  CronogramaPanel,
} from "@/shared/ui/cronograma-layout";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { formatShortDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";
import {
  PurchaseOrderItemsEditor,
  newPurchaseLine,
  reindexPurchaseLines,
  type PurchaseLineProduct,
  type PurchaseOrderLineDraft,
} from "@/components/purchasing/purchase-order-items-editor";
import type { SupplierOption } from "@/components/purchasing/supplier-quick-create-modal";
import { SUPPLIERS_ACTIVE_QUERY_KEY } from "@/modules/compras/lib/suppliers/query-keys";
import {
  requisitionsCountQueryKey,
  requisitionsQueryKey,
} from "@/components/purchasing/purchase-requisitions-panel";
import type { QuoteRequestHistoryRow } from "@/modules/compras/lib/purchasing/request-purchase-quote";

export const quoteRequestsQueryKey = ["purchasing-quote-requests"] as const;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 16);
  }
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
    data?: Array<{
      id: string;
      code: string;
      name: string;
      document?: string | null;
      email?: string | null;
      phone?: string | null;
    }>;
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

async function fetchQuoteHistory(
  search: string
): Promise<QuoteRequestHistoryRow[]> {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const res = await fetch(
    `/api/purchasing/quote-requests${qs ? `?${qs}` : ""}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    rows?: QuoteRequestHistoryRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar histórico");
  return json.rows ?? [];
}

type RequestQuoteTabProps = {
  search?: string;
};

export function RequestQuoteTab({ search = "" }: RequestQuoteTabProps) {
  const qc = useQueryClient();
  const [requestDate, setRequestDate] = useState(todayISODate);
  const [needDate, setNeedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState(
    "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento."
  );
  const [lines, setLines] = useState<PurchaseOrderLineDraft[]>([
    newPurchaseLine(0),
  ]);
  const [productCache, setProductCache] = useState<
    Record<string, PurchaseLineProduct>
  >({});
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(
    new Set()
  );
  const [supplierFilter, setSupplierFilter] = useState("");
  const [extraEmail, setExtraEmail] = useState("");

  const suppliersQ = useQuery({
    queryKey: [...SUPPLIERS_ACTIVE_QUERY_KEY, "quote-request-multi"],
    queryFn: fetchActiveSuppliers,
    staleTime: 60_000,
  });

  const historyQ = useQuery({
    queryKey: [...quoteRequestsQueryKey, search],
    queryFn: () => fetchQuoteHistory(search),
  });

  const filteredSuppliers = useMemo(() => {
    const q = supplierFilter.trim().toLowerCase();
    const list = suppliersQ.data ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.email?.toLowerCase().includes(q) ?? false)
    );
  }, [suppliersQ.data, supplierFilter]);

  const toggleSupplier = (id: string) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitMut = useMutation({
    mutationFn: async () => {
      const payloadLines = lines
        .map((l) => ({
          product_id: l.productId.trim() || null,
          description: l.description.trim(),
          quantity: l.quantity,
          unit: l.unit.trim() || "UN",
        }))
        .filter((l) => l.description);

      if (!payloadLines.length) {
        throw new Error("Adicione pelo menos um item com descrição.");
      }
      for (const l of payloadLines) {
        if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
          throw new Error("Quantidade inválida num item.");
        }
      }
      if (selectedSupplierIds.size === 0) {
        throw new Error(
          "Seleccione pelo menos um fornecedor para enviar a solicitação."
        );
      }

      const res = await fetch("/api/purchasing/quote-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_ids: [...selectedSupplierIds],
          request_date: requestDate || null,
          need_date: needDate || null,
          notes,
          message,
          extra_emails: extraEmail.trim() ? [extraEmail.trim()] : [],
          lines: payloadLines,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          item_count: number;
          suppliers_sent: Array<{ name: string }>;
          suppliers_skipped: Array<{ name: string; reason: string }>;
          email_sent_count: number;
          warning?: string | null;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao solicitar orçamento");
      return json.data!;
    },
    onSuccess: (data) => {
      if (data.warning) toast.warning(data.warning);
      const names = data.suppliers_sent.map((s) => s.name).join(", ");
      toast.success(
        `Orçamento solicitado (${data.item_count} item(ns)) para: ${names}.`
      );
      if (data.suppliers_skipped.length) {
        toast.warning(
          `Não enviado: ${data.suppliers_skipped
            .map((s) => `${s.name} (${s.reason})`)
            .join("; ")}`
        );
      }
      setLines(reindexPurchaseLines([newPurchaseLine(0)]));
      setProductCache({});
      setSelectedSupplierIds(new Set());
      setExtraEmail("");
      setNotes("");
      void qc.invalidateQueries({ queryKey: quoteRequestsQueryKey });
      void qc.invalidateQueries({ queryKey: requisitionsQueryKey });
      void qc.invalidateQueries({ queryKey: requisitionsCountQueryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao solicitar orçamento"),
  });

  const historyColumns: SortableTableColumn<QuoteRequestHistoryRow>[] =
    useMemo(
      () => [
        {
          key: "sent_at",
          label: "Enviado em",
          type: "date",
          width: "w-[16%]",
          accessor: (row) => row.quotation_sent_at,
          truncate: false,
          render: (row) => (
            <span className={CRONOGRAMA_TOKENS.cellMuted}>
              {formatDateTime(row.quotation_sent_at)}
            </span>
          ),
        },
        {
          key: "product",
          label: "Item",
          type: "text",
          width: "w-[36%]",
          accessor: (row) =>
            `${row.product_code ?? ""} ${row.product_name ?? row.description}`,
          truncate: false,
          render: (row) => (
            <div className="min-w-0">
              <p className="font-medium text-slate-900 truncate">
                {row.product_name ?? row.description}
              </p>
              <p className="text-xs text-slate-500 font-mono truncate">
                {row.product_code ?? "—"}
              </p>
            </div>
          ),
        },
        {
          key: "qty",
          label: "Qtd",
          type: "number",
          width: "w-[12%]",
          accessor: (row) => row.quantity,
          truncate: false,
          render: (row) => (
            <span className={CRONOGRAMA_TOKENS.cellMuted}>
              {row.quantity} {row.unit}
            </span>
          ),
        },
        {
          key: "need_date",
          label: "Necessidade",
          type: "date",
          width: "w-[14%]",
          accessor: (row) => row.need_date,
          truncate: false,
          render: (row) => (
            <span className={CRONOGRAMA_TOKENS.cellMuted}>
              {formatDate(row.need_date)}
            </span>
          ),
        },
        {
          key: "status",
          label: "Status",
          type: "text",
          width: "w-[18%]",
          accessor: () => "Orçamento solicitado",
          truncate: false,
          render: () => (
            <span
              className={`${CRONOGRAMA_TOKENS.badge} bg-blue-50 text-blue-800 ring-blue-200`}
            >
              Orçamento solicitado
            </span>
          ),
        },
      ],
      []
    );

  return (
    <div className="space-y-6">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          submitMut.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-600" aria-hidden />
              Dados da solicitação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quote-request-date">Data da solicitação *</Label>
                <BrDateInput
                  id="quote-request-date"
                  value={requestDate || null}
                  onChange={(iso) => setRequestDate(iso ?? "")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-need-date">Data prevista de necessidade</Label>
                <BrDateInput
                  id="quote-need-date"
                  value={needDate || null}
                  onChange={(iso) => setNeedDate(iso ?? "")}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quote-notes">Observações</Label>
                <Textarea
                  id="quote-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="resize-y min-h-[5rem]"
                  placeholder="Opcional…"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Itens da solicitação</CardTitle>
          </CardHeader>
          <CardContent>
            <PurchaseOrderItemsEditor
              variant="quote"
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
            <CardTitle className="text-lg">Enviar para fornecedores</CardTitle>
            <p className="text-sm text-slate-600 font-normal">
              A mesma solicitação pode ser enviada a vários fornecedores. O
              fornecedor não fica fixo na requisição — defina-o depois ao emitir
              o PC.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quote-message">Mensagem ao fornecedor</Label>
              <Textarea
                id="quote-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="resize-y"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quote-extra-email">E-mail adicional (opcional)</Label>
              <Input
                id="quote-extra-email"
                type="email"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                placeholder="Cópia para outro destinatário…"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>
                  Fornecedores *
                  {selectedSupplierIds.size > 0
                    ? ` (${selectedSupplierIds.size} seleccionado${selectedSupplierIds.size === 1 ? "" : "s"})`
                    : ""}
                </Label>
                <Input
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  placeholder="Filtrar por código, nome ou e-mail…"
                  className="h-8 max-w-xs text-sm"
                />
              </div>

              {suppliersQ.isLoading ? (
                <p className="text-sm text-slate-500 py-4">
                  A carregar fornecedores…
                </p>
              ) : suppliersQ.isError ? (
                <p className="text-sm text-red-700 py-2">
                  {suppliersQ.error instanceof Error
                    ? suppliersQ.error.message
                    : "Erro ao carregar fornecedores"}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
                  {filteredSuppliers.length === 0 ? (
                    <p className="text-sm text-slate-500 px-3 py-4">
                      Nenhum fornecedor encontrado.
                    </p>
                  ) : (
                    filteredSuppliers.map((s) => {
                      const checked = selectedSupplierIds.has(s.id);
                      const hasEmail = Boolean(s.email?.trim());
                      return (
                        <label
                          key={s.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50",
                            checked && "bg-slate-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => toggleSupplier(s.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900">
                              <span className="font-mono text-xs text-slate-500 mr-1.5">
                                {s.code || "—"}
                              </span>
                              {s.name}
                            </span>
                            <span
                              className={cn(
                                "block text-xs",
                                hasEmail ? "text-slate-500" : "text-amber-700"
                              )}
                            >
                              {hasEmail
                                ? s.email
                                : "Sem e-mail no cadastro — precisa de e-mail adicional"}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={submitMut.isPending}>
                {submitMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Solicitar orçamento
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="space-y-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Orçamentos solicitados
          </h3>
          <p className="text-sm text-slate-600">
            Histórico de cotações enviadas que ainda não viraram pedido de
            compra. Emita o PC em Requisições.
          </p>
        </div>
        <CronogramaPanel>
          {historyQ.isLoading ? (
            <CronogramaLoading message="A carregar histórico…" />
          ) : historyQ.isError ? (
            <CronogramaError
              message={
                historyQ.error instanceof Error
                  ? historyQ.error.message
                  : "Erro ao carregar histórico"
              }
            />
          ) : (
            <SortableTable
              columns={historyColumns}
              data={historyQ.data ?? []}
              getRowKey={(row) => row.id}
              emptyMessage="Nenhum orçamento solicitado ainda."
            />
          )}
        </CronogramaPanel>
      </div>
    </div>
  );
}
