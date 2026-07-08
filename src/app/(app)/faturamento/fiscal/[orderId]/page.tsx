"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  PackageCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FiscalStatusBadge } from "@/components/fiscal/fiscal-status-badge";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { billingNfeDisplayLabel } from "@/modules/faturamento/lib/sales-order-billing-display";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";

async function fetchFiscalReview(orderId: string): Promise<FiscalOrderReview> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/review`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar revisão fiscal");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function postAlignFiscal(orderId: string): Promise<FiscalOrderReview> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/review`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "align" }),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao alinhar fiscal");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function postFiscalAi(
  salesOrderId: string,
  description: string
): Promise<{ summary: string }> {
  const res = await fetch("/api/ai/fiscal-order-assistant", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId, description }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { summary?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro no assistente fiscal");
  return { summary: json.data?.summary ?? "Fiscal aplicado." };
}

async function postCloseWithoutInvoice(orderId: string): Promise<void> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/close-without-invoice`,
    { method: "POST", credentials: "include" }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao fechar sem nota");
}

export default function FiscalOrderReviewPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { canMenu } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canFaturamento = isAdmin || canMenu("faturamento");

  const [aiOpen, setAiOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState(
    "Cliente no estado do endereço. Cliente é revenda."
  );
  const [aiLoading, setAiLoading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fiscal-order-review", orderId],
    queryFn: () => fetchFiscalReview(orderId),
    enabled: Boolean(orderId) && canFaturamento,
    staleTime: 15_000,
  });

  const alignMutation = useMutation({
    mutationFn: () => postAlignFiscal(orderId),
    onSuccess: () => {
      toast.success("Fiscal alinhado — status actualizado para Impostos manuais.");
      void queryClient.invalidateQueries({ queryKey: ["fiscal-order-review", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["fiscal-invoicing"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeMutation = useMutation({
    mutationFn: () => postCloseWithoutInvoice(orderId),
    onSuccess: () => {
      toast.success("Pedido enviado para Autorizadas (entrega sem nota).");
      void queryClient.invalidateQueries({ queryKey: ["fiscal-invoicing"] });
      router.push("/faturamento/fiscal?tab=nfe_authorized");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runAi = async () => {
    setAiLoading(true);
    try {
      const out = await postFiscalAi(orderId, aiDescription);
      toast.success(out.summary);
      setAiOpen(false);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["fiscal-invoicing"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAiLoading(false);
    }
  };

  const nfeDisplay = useMemo(() => {
    if (!data) return { label: "—", className: "bg-slate-100 text-slate-700" };
    const d = billingNfeDisplayLabel({
      billing_closure: data.billing_closure,
      billing_plan: data.billing_plan,
      nfe_status: null,
    });
    if (d.label) return d;
    return { label: "Sem NF-e", className: "bg-slate-100 text-slate-700" };
  }, [data]);

  if (!canFaturamento) {
    return (
      <AppPage title="Revisão fiscal" backHref="/faturamento/fiscal">
        <p className="text-sm text-slate-600">Sem permissão para faturamento.</p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={
        data ? (
          <span>
            Revisão fiscal —{" "}
            <span className="font-mono text-emerald-800">{data.order_number}</span>
          </span>
        ) : (
          "Revisão fiscal"
        )
      }
      description="Conferência só da parte fiscal: cliente, UF, NCM, impostos e alinhamento antes de emitir ou fechar sem nota."
      backHref="/faturamento/fiscal"
      backLabel="Voltar ao faturamento"
      width="wide"
      actions={
        data ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAiOpen(true)}
              disabled={!isAdmin}
            >
              <Sparkles className="h-4 w-4" />
              Assistente IA
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!isAdmin || alignMutation.isPending || data.fiscal_configured}
              onClick={() => alignMutation.mutate()}
            >
              {alignMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Fiscal alinhado
            </Button>
            {data.billing_plan === "without_invoice" &&
            !data.billing_closure &&
            data.ready_for_invoice ? (
              <Button
                type="button"
                size="sm"
                disabled={!isAdmin || closeMutation.isPending}
                onClick={() => closeMutation.mutate()}
              >
                {closeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="h-4 w-4" />
                )}
                Confirmar sem nota
              </Button>
            ) : null}
            <Link
              href={`/sales/orders/${orderId}`}
              className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ExternalLink className="h-4 w-4" />
              Pedido completo
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
          {data.warnings.length > 0 ? (
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
              Fiscal alinhado — pode emitir NF-e ou confirmar entrega sem nota.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Cliente e destino</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Cliente</span>
                  <p className="font-medium text-slate-900">{data.client_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Documento</span>
                    <p>{data.client_document ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">UF destino</span>
                    <p className="font-semibold">{data.destination_uf ?? "—"}</p>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Endereço</span>
                  <p className="text-slate-700">{data.client_address ?? "—"}</p>
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
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                      nfeDisplay.className
                    )}
                  >
                    {nfeDisplay.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Data pedido</span>
                    <p>{formatShortDate(data.order_date)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Liberação PCP</span>
                    <p>{data.ready_for_invoice ? "Liberado ✓" : "Pendente"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                  <div>
                    <span className="text-slate-500">Total</span>
                    <p className="font-semibold">{fmtBRL(data.total)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">ICMS / IPI</span>
                    <p>
                      {fmtBRL(data.total_icms)} / {fmtBRL(data.total_ipi)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Itens e impostos</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Descrição / produto</th>
                    <th className="px-3 py-2 font-medium">NCM</th>
                    <th className="px-3 py-2 font-medium">Natureza</th>
                    <th className="px-3 py-2 font-medium text-right">Qtd</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-right">ICMS %</th>
                    <th className="px-3 py-2 font-medium text-right">ICMS R$</th>
                    <th className="px-3 py-2 font-medium text-right">IPI %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2 text-slate-500">{it.line_number}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {it.product_name ?? it.description}
                        </div>
                        {it.product_name && it.description !== it.product_name ? (
                          <div className="text-xs text-slate-500">{it.description}</div>
                        ) : null}
                        {!it.product_id ? (
                          <div className="text-[10px] text-amber-700">Sem produto</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {it.ncm ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {it.product_nature ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {fmtBRL(it.total_price)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {it.icms_rate != null ? `${it.icms_rate}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {it.icms_value != null ? fmtBRL(it.icms_value) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {it.ipi_rate != null ? `${it.ipi_rate}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500">
            Fluxo sugerido: 1) Assistente IA (classificar revenda/consumidor) ou
            «Fiscal alinhado» → 2) se for sem nota e PCP liberou, «Confirmar sem
            nota» → Autorizadas.
          </p>
        </div>
      ) : null}

      {aiOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Assistente fiscal (IA)
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Indique se é consumidor final, revenda ou industrialização, UF e
              condições especiais.
            </p>
            <textarea
              className="mt-3 w-full min-h-[120px] rounded-lg border border-slate-200 p-3 text-sm"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="Ex.: Cliente em SP, revenda…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aiLoading}
                onClick={() => setAiOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={aiLoading}
                onClick={() => void runAi()}
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Aplicar fiscal
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}
