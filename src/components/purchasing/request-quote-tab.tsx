"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
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
import {
  PurchaseOrderItemsEditor,
  newPurchaseLine,
  reindexPurchaseLines,
  type PurchaseLineProduct,
  type PurchaseOrderLineDraft,
} from "@/components/purchasing/purchase-order-items-editor";
import {
  purchaseQuoteRequestStatusLabel,
  type PurchaseQuoteRequestListRow,
} from "@/modules/compras/lib/purchasing/request-purchase-quote";

export const quoteRequestsQueryKey = ["purchasing-quote-requests"] as const;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

async function fetchQuoteList(
  search: string
): Promise<PurchaseQuoteRequestListRow[]> {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const res = await fetch(
    `/api/purchasing/quote-requests${qs ? `?${qs}` : ""}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    rows?: PurchaseQuoteRequestListRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar solicitações");
  return json.rows ?? [];
}

type RequestQuoteTabProps = {
  search?: string;
};

export function RequestQuoteTab({ search = "" }: RequestQuoteTabProps) {
  const router = useRouter();
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

  const listQ = useQuery({
    queryKey: [...quoteRequestsQueryKey, search],
    queryFn: () => fetchQuoteList(search),
  });

  const saveMut = useMutation({
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
      if (!requestDate) {
        throw new Error("Indique a data da solicitação.");
      }

      const res = await fetch("/api/purchasing/quote-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_date: requestDate,
          need_date: needDate || null,
          notes,
          message,
          lines: payloadLines,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string; request_number: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao gravar solicitação");
      return json.data!;
    },
    onSuccess: (data) => {
      toast.success(`Solicitação n.º ${data.request_number} gravada.`);
      setLines(reindexPurchaseLines([newPurchaseLine(0)]));
      setProductCache({});
      setNotes("");
      void qc.invalidateQueries({ queryKey: quoteRequestsQueryKey });
      void qc.invalidateQueries({ queryKey: ["purchasing-requisitions"] });
      router.push(`/purchasing/quote-requests/${data.id}`);
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : "Erro ao gravar solicitação"
      ),
  });

  const columns: SortableTableColumn<PurchaseQuoteRequestListRow>[] = useMemo(
    () => [
      {
        key: "request_number",
        label: "N.º",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.request_number,
        truncate: false,
        render: (row) => (
          <Link
            href={`/purchasing/quote-requests/${row.id}`}
            className={CRONOGRAMA_TOKENS.cellLink}
          >
            {row.request_number}
          </Link>
        ),
      },
      {
        key: "request_date",
        label: "Data",
        type: "date",
        width: "w-[11%]",
        accessor: (row) => row.request_date,
        truncate: false,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {formatDate(row.request_date)}
          </span>
        ),
      },
      {
        key: "need_date",
        label: "Necessidade",
        type: "date",
        width: "w-[11%]",
        accessor: (row) => row.need_date,
        truncate: false,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {formatDate(row.need_date)}
          </span>
        ),
      },
      {
        key: "items",
        label: "Itens",
        type: "number",
        width: "w-[8%]",
        accessor: (row) => row.item_count,
        truncate: false,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>{row.item_count}</span>
        ),
      },
      {
        key: "status",
        label: "Status",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => purchaseQuoteRequestStatusLabel(row.status),
        truncate: false,
        render: (row) => (
          <span
            className={`${CRONOGRAMA_TOKENS.badge} ${
              row.status === "converted"
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : row.status === "sent"
                  ? "bg-blue-50 text-blue-800 ring-blue-200"
                  : "bg-amber-50 text-amber-900 ring-amber-200"
            }`}
          >
            {purchaseQuoteRequestStatusLabel(row.status)}
          </span>
        ),
      },
      {
        key: "pc",
        label: "Pedido",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.converted_po_number ?? "",
        truncate: false,
        render: (row) =>
          row.converted_to_purchase_order_id ? (
            <Link
              href={`/purchasing/orders/${row.converted_to_purchase_order_id}`}
              className={CRONOGRAMA_TOKENS.cellLink}
            >
              {row.converted_po_number ?? "PC"}
            </Link>
          ) : (
            <span className={CRONOGRAMA_TOKENS.cellMuted}>—</span>
          ),
      },
      {
        key: "notes",
        label: "Observações",
        type: "text",
        width: "w-[18%]",
        accessor: (row) => row.notes ?? "",
        truncate: true,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {row.notes?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Ações",
        type: "text",
        width: "w-[12%]",
        sortable: false,
        align: "right",
        truncate: false,
        render: (row) => (
          <Link href={`/purchasing/quote-requests/${row.id}`}>
            <Button type="button" variant="outline" size="sm" className="h-8">
              Abrir
            </Button>
          </Link>
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
          saveMut.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-600" aria-hidden />
              Dados da solicitação
            </CardTitle>
            <p className="text-sm text-slate-600 font-normal">
              Igual a vendas: grave o orçamento com número, envie o PDF e depois
              converta em pedido de compra.
            </p>
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
                <Label htmlFor="quote-need-date">
                  Data prevista de necessidade
                </Label>
                <BrDateInput
                  id="quote-need-date"
                  value={needDate || null}
                  onChange={(iso) => setNeedDate(iso ?? "")}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quote-message">Mensagem no documento</Label>
                <Textarea
                  id="quote-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="resize-y"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quote-notes">Observações</Label>
                <Textarea
                  id="quote-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="resize-y min-h-[4rem]"
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

        <div className="flex justify-end">
          <Button type="submit" disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar solicitação
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Orçamentos de compra
          </h3>
          <p className="text-sm text-slate-600">
            Abra o documento para imprimir, enviar e gerar o pedido de compra.
          </p>
        </div>
        <CronogramaPanel>
          {listQ.isLoading ? (
            <CronogramaLoading message="A carregar solicitações…" />
          ) : listQ.isError ? (
            <CronogramaError
              message={
                listQ.error instanceof Error
                  ? listQ.error.message
                  : "Erro ao carregar solicitações"
              }
            />
          ) : (
            <SortableTable
              columns={columns}
              data={listQ.data ?? []}
              getRowKey={(row) => row.id}
              emptyMessage="Nenhuma solicitação gravada ainda."
            />
          )}
        </CronogramaPanel>
      </div>
    </div>
  );
}
