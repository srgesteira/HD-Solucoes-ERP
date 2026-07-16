"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { FiscalStatusBadge } from "@/components/fiscal/fiscal-status-badge";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type { FiscalPurchaseOrderReview } from "@/modules/faturamento/lib/fiscal-purchase-order-review-service";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

async function fetchInboundReview(
  orderId: string
): Promise<FiscalPurchaseOrderReview> {
  const res = await fetch(
    `/api/faturamento/entrada/${encodeURIComponent(orderId)}/review`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalPurchaseOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar revisão fiscal");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function postReapply(orderId: string): Promise<FiscalPurchaseOrderReview> {
  const res = await fetch(
    `/api/faturamento/entrada/${encodeURIComponent(orderId)}/review`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reapply" }),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalPurchaseOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao aplicar regras");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function postFinalize(orderId: string): Promise<FiscalPurchaseOrderReview> {
  const res = await fetch(
    `/api/faturamento/entrada/${encodeURIComponent(orderId)}/finalize-fiscal`,
    { method: "POST", credentials: "include" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalPurchaseOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao finalizar conferência");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

export default function FiscalInboundReviewPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params.id === "string" ? params.id : "";
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { canMenu } = usePermissions();
  const canFaturamento = me?.role === "admin" || canMenu("faturamento");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fiscal-inbound-review", orderId],
    queryFn: () => fetchInboundReview(orderId),
    enabled: Boolean(orderId) && canFaturamento,
    staleTime: 15_000,
  });

  const reapplyMutation = useMutation({
    mutationFn: () => postReapply(orderId),
    onSuccess: () => {
      toast.success("Regras fiscais aplicadas.");
      void queryClient.invalidateQueries({
        queryKey: ["fiscal-inbound-review", orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ["fiscal-inbound-kanban"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => postFinalize(orderId),
    onSuccess: () => {
      toast.success("Conferência fiscal de entrada finalizada.");
      void queryClient.invalidateQueries({
        queryKey: ["fiscal-inbound-review", orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ["fiscal-inbound-kanban"] });
      router.push("/faturamento/entrada");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!canFaturamento) {
    return (
      <AppPage title="Conferência fiscal de entrada" backHref="/faturamento/entrada">
        <p className="text-sm text-slate-600">Sem permissão para faturamento.</p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={
        data ? (
          <span>
            Entrada fiscal —{" "}
            <span className="font-mono text-emerald-800">{data.order_number}</span>
          </span>
        ) : (
          "Conferência fiscal de entrada"
        )
      }
      description="Espelho da saída: fornecedor e impostos. Comercial (qtd/preço) no PC; aqui só a parte fiscal."
      backHref="/faturamento/entrada"
      backLabel="Voltar ao kanban de entrada"
      width="wide"
      actions={
        data ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                !canFaturamento ||
                reapplyMutation.isPending ||
                Boolean(data.fiscal_finalized_at)
              }
              onClick={() => reapplyMutation.mutate()}
            >
              {reapplyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Aplicar regras
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !canFaturamento ||
                finalizeMutation.isPending ||
                !data.can_finalize_fiscal
              }
              onClick={() => {
                if (
                  !confirm(
                    `Finalizar conferência fiscal de ${data.order_number}?`
                  )
                ) {
                  return;
                }
                finalizeMutation.mutate();
              }}
            >
              {finalizeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Finalizar conferência fiscal
            </Button>
            <Link
              href={`/purchasing/orders/${orderId}`}
              className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ExternalLink className="h-4 w-4" />
              Pedido de compra
            </Link>
          </div>
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600">
          {error instanceof Error ? error.message : "Erro ao carregar"}
        </p>
      ) : data ? (
        <div className="space-y-4">
          {data.fiscal_finalized_at ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Conferência fiscal finalizada em{" "}
              {formatShortDate(data.fiscal_finalized_at)}.
            </div>
          ) : data.status !== "received" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Ainda em aberto — pode pré-aplicar regras. O botão «Finalizar
              conferência fiscal» só fica activo depois do recebimento em
              Compras.
            </div>
          ) : data.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">Pontos a conferir</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Fiscal alinhado. Pode finalizar a conferência.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Fornecedor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Nome</span>
                  <p className="font-medium text-slate-900">
                    {data.supplier_name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Documento</span>
                    <p>{data.supplier_document ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">UF</span>
                    <p className="font-semibold">{data.supplier_uf ?? "—"}</p>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Data do pedido</span>
                  <p>{formatShortDate(data.order_date)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Totais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="font-medium">{fmtBRL(data.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Base</span>
                  <span>{fmtBRL(data.total_tax_base)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ICMS</span>
                  <span>{fmtBRL(data.total_icms)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IPI</span>
                  <span>{fmtBRL(data.total_ipi)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Frete</span>
                  <span>{fmtBRL(data.freight_cost)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Estado fiscal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <FiscalStatusBadge status={data.fiscal_status} />
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      data.status === "received"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {data.status}
                  </span>
                </div>
                <p className="text-slate-600">{data.fiscal_status_label}</p>
                {data.notes ? (
                  <div>
                    <span className="text-slate-500">Notas</span>
                    <p className="text-slate-700 whitespace-pre-wrap">
                      {data.notes}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Itens (fiscal)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-2 pr-2">Descrição</th>
                    <th className="py-2 pr-2">NCM</th>
                    <th className="py-2 pr-2">Utilização</th>
                    <th className="py-2 pr-2 text-right">Qtd</th>
                    <th className="py-2 pr-2 text-right">ICMS %</th>
                    <th className="py-2 pr-2 text-right">IPI %</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-slate-900">
                          {it.product_name ?? it.description}
                        </p>
                        {it.line_warnings.length > 0 ? (
                          <ul className="mt-0.5 text-[11px] text-amber-800 list-disc pl-4">
                            {it.line_warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">
                        {it.ncm ?? "—"}
                      </td>
                      <td className="py-2 pr-2 text-xs">
                        {it.usage_type ?? "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {fmtPct(it.icms_rate)}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {fmtPct(it.ipi_rate)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtBRL(it.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                Alíquotas gravadas pelo motor fiscal (readonly aqui). Aviso de
                utilização não trava a finalização.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => void refetch()}
              >
                Actualizar
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </AppPage>
  );
}
