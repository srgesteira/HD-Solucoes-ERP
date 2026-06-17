"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, PackageMinus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import {
  DataList,
  ErrorState,
  LoadingState,
  StatusBadge,
  type StatusTone,
} from "@/shared/ui/page-helpers";
import { AuditHistoryPanel } from "@/components/audit/audit-history-panel";
import {
  FINANCIAL_ACTION_LABELS,
  PURCHASE_RETURN_REASON_LABELS,
  type PurchaseReturnReason,
  type PurchaseReturnStatus,
  type ReturnFinancialAction,
} from "@/modules/reverse/lib/returns-types";

type Detail = {
  header: {
    id: string;
    return_number: string;
    return_date: string;
    purchase_order_id: string;
    reason: PurchaseReturnReason;
    notes: string | null;
    financial_action: ReturnFinancialAction;
    status: PurchaseReturnStatus;
    total_value: number;
  };
  items: Array<{
    id: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
};

async function fetchDetail(id: string): Promise<Detail> {
  const res = await fetch(`/api/purchase-returns/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Detail & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar devolução");
  return json;
}

async function postAction(id: string, action: "authorize" | "ship") {
  const res = await fetch(`/api/purchase-returns/${id}/${action}`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro");
}

const STATUS_LABEL: Record<PurchaseReturnStatus, string> = {
  draft: "Rascunho",
  authorized: "Autorizada",
  sent: "Enviada",
  cancelled: "Cancelada",
};

const STATUS_TONE: Record<PurchaseReturnStatus, StatusTone> = {
  draft: "neutral",
  authorized: "warning",
  sent: "success",
  cancelled: "danger",
};

function formatBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PurchaseReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["purchase-return", id],
    queryFn: () => fetchDetail(id),
    enabled: Boolean(id),
  });

  const authorizeMut = useMutation({
    mutationFn: () => postAction(id, "authorize"),
    onSuccess: () => {
      toast.success("Devolução autorizada.");
      void queryClient.invalidateQueries({ queryKey: ["purchase-return", id] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shipMut = useMutation({
    mutationFn: () => postAction(id, "ship"),
    onSuccess: () => {
      toast.success("Devolução enviada — estoque e financeiro atualizados.");
      void queryClient.invalidateQueries({ queryKey: ["purchase-return", id] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) {
    return (
      <AppPage title="Devolução de compra" backHref="/purchasing/returns">
        <LoadingState />
      </AppPage>
    );
  }
  if (query.error) {
    return (
      <AppPage title="Devolução de compra" backHref="/purchasing/returns">
        <ErrorState message={(query.error as Error).message} />
      </AppPage>
    );
  }
  if (!query.data) return null;
  const { header, items } = query.data;
  const busy = authorizeMut.isPending || shipMut.isPending;

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" /> Devolução {header.return_number}
        </span>
      }
      description={
        <>
          Pedido de compra:{" "}
          <Link
            className="text-brand-700 hover:underline"
            href={`/purchasing/orders/${header.purchase_order_id}`}
          >
            ver pedido
          </Link>
        </>
      }
      backHref="/purchasing/returns"
      density="comfortable"
      actions={
        <>
          <StatusBadge tone={STATUS_TONE[header.status]}>
            {STATUS_LABEL[header.status]}
          </StatusBadge>
          {header.status === "draft" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => authorizeMut.mutate()}
            >
              {authorizeMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Autorizar
            </Button>
          ) : null}
          {header.status === "authorized" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Confirmar despacho? Vai sair do estoque e gerar receivable contra o fornecedor (se aplicável)."
                  )
                ) {
                  shipMut.mutate();
                }
              }}
            >
              {shipMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageMinus className="h-4 w-4" />
              )}
              Despachar
            </Button>
          ) : null}
        </>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <DataList
            items={[
              {
                label: "Motivo",
                value: PURCHASE_RETURN_REASON_LABELS[header.reason],
              },
              {
                label: "Ação financeira",
                value: FINANCIAL_ACTION_LABELS[header.financial_action],
              },
              {
                label: "Total devolvido",
                value: (
                  <span className="tabular-nums">
                    {formatBRL(header.total_value)}
                  </span>
                ),
              },
              ...(header.notes
                ? [
                    {
                      label: "Observações",
                      value: (
                        <span className="whitespace-pre-wrap">
                          {header.notes}
                        </span>
                      ),
                      span: 2 as const,
                    },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Itens devolvidos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-2 text-left font-medium text-slate-700">
                  Descrição
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  Qtde
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  Unitário
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{it.description ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(it.quantity)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(it.unit_price)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatBRL(it.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <AuditHistoryPanel table="purchase_returns" recordId={id} />
        </CardContent>
      </Card>
    </AppPage>
  );
}
