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
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FiscalStatusBadge } from "@/components/fiscal/fiscal-status-badge";
import {
  FiscalAiAssistantModal,
  type FiscalAiAssistantResponse,
} from "@/components/fiscal/fiscal-ai-assistant-modal";
import { AppPage } from "@/shared/ui/app-page";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type {
  FiscalOrderReview,
  FiscalOrderReviewItem,
  ManualFiscalItemInput,
} from "@/modules/faturamento/lib/fiscal-order-review-service";
import {
  FiscalItemEditButton,
  FiscalItemEditModal,
} from "@/components/fiscal/fiscal-item-edit-modal";
import { billingNfeDisplayLabel } from "@/modules/faturamento/lib/sales-order-billing-display";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

function fmtBool(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Sim" : "Não";
}

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
): Promise<FiscalAiAssistantResponse> {
  const res = await fetch("/api/ai/fiscal-order-assistant", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sales_order_id: salesOrderId, description }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalAiAssistantResponse & { fiscalStatus?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro no assistente fiscal");
  return {
    status: json.data?.status ?? "applied",
    summary: json.data?.summary ?? "Fiscal aplicado.",
    questions: json.data?.questions ?? [],
    fiscalStatus: json.data?.fiscalStatus,
  };
}

async function postManualFiscalItem(
  orderId: string,
  itemId: string,
  fiscal: ManualFiscalItemInput
): Promise<FiscalOrderReview> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/review`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "manual_item", item_id: itemId, fiscal }),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao gravar fiscal manual");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
}

async function postReapplyFiscal(orderId: string): Promise<FiscalOrderReview> {
  const res = await fetch(
    `/api/faturamento/fiscal/${encodeURIComponent(orderId)}/review`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reapply" }),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: FiscalOrderReview;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao reaplicar regras");
  if (!json.data) throw new Error("Resposta inválida");
  return json.data;
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
  const [aiDescription, setAiDescription] = useState("");
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [editItem, setEditItem] = useState<FiscalOrderReviewItem | null>(null);

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

  const reapplyMutation = useMutation({
    mutationFn: () => postReapplyFiscal(orderId),
    onSuccess: () => {
      toast.success("Regras fiscais reaplicadas — CFOP e alíquotas actualizados.");
      void queryClient.invalidateQueries({ queryKey: ["fiscal-order-review", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["fiscal-invoicing"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const manualSaveMutation = useMutation({
    mutationFn: ({
      itemId,
      fiscal,
    }: {
      itemId: string;
      fiscal: ManualFiscalItemInput;
    }) => postManualFiscalItem(orderId, itemId, fiscal),
    onSuccess: () => {
      toast.success("Fiscal manual gravado para o item.");
      setEditItem(null);
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
      if (out.status === "needs_input") {
        setAiQuestions(out.questions);
        toast.message(out.summary);
        return;
      }
      if (out.status === "rules_applied") {
        toast.info(out.summary);
      } else {
        toast.success(out.summary);
      }
      setAiOpen(false);
      setAiDescription("");
      setAiQuestions([]);
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
              disabled={!isAdmin || reapplyMutation.isPending}
              onClick={() => reapplyMutation.mutate()}
            >
              {reapplyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Reaplicar regras
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAiQuestions([]);
                setAiDescription("");
                setAiOpen(true);
              }}
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
              Fiscal alinhado. Quando o PCP liberar, a emissão fica na
              Expedição; ou confirme entrega sem nota no Faturamento.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
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
                <CardTitle className="text-base">Operação fiscal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">UF origem (empresa)</span>
                    <p className="font-semibold">{data.origin_uf ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">UF destino</span>
                    <p className="font-semibold">{data.destination_uf ?? "—"}</p>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Regime tributário</span>
                  <p>{data.tax_regime ?? "—"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Operação</span>
                  <p>Venda</p>
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
                    <span className="text-slate-500">Base / ICMS / IPI</span>
                    <p className="text-xs leading-relaxed">
                      {fmtBRL(data.total_tax_base)} · {fmtBRL(data.total_icms)} ·{" "}
                      {fmtBRL(data.total_ipi)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Conferência fiscal por item</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium min-w-[180px]">Produto</th>
                    <th className="px-2 py-2 font-medium">NCM</th>
                    <th className="px-2 py-2 font-medium">Natureza</th>
                    <th className="px-2 py-2 font-medium">Utilização</th>
                    <th className="px-2 py-2 font-medium">CFOP</th>
                    <th className="px-2 py-2 font-medium">Regra</th>
                    <th className="px-2 py-2 font-medium text-right">Qtd</th>
                    <th className="px-2 py-2 font-medium text-right">Total</th>
                    <th className="px-2 py-2 font-medium text-right">Base</th>
                    <th className="px-2 py-2 font-medium text-right">ICMS %</th>
                    <th className="px-2 py-2 font-medium text-right">ICMS R$</th>
                    <th className="px-2 py-2 font-medium text-right">ST</th>
                    <th className="px-2 py-2 font-medium text-right">ST %</th>
                    <th className="px-2 py-2 font-medium text-right">IPI %</th>
                    <th className="px-2 py-2 font-medium text-right">IPI R$</th>
                    <th className="px-2 py-2 font-medium text-right">PIS %</th>
                    <th className="px-2 py-2 font-medium text-right">PIS R$</th>
                    <th className="px-2 py-2 font-medium text-right">COFINS %</th>
                    <th className="px-2 py-2 font-medium text-right">COFINS R$</th>
                    <th className="px-2 py-2 font-medium text-right">CBS %</th>
                    <th className="px-2 py-2 font-medium text-right">IBS %</th>
                    <th className="px-2 py-2 font-medium">Class. IBS/CBS</th>
                    {isAdmin ? (
                      <th className="px-2 py-2 font-medium text-center">Acção</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr
                      key={it.id}
                      className={cn(
                        "border-b border-slate-100 last:border-0 align-top",
                        it.fiscal_source === "preview" && "bg-amber-50/50",
                        it.fiscal_source === "manual" && "bg-sky-50/40",
                        !it.cfop && "bg-rose-50/30"
                      )}
                    >
                      <td className="px-2 py-2 text-slate-500">{it.line_number}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-900">
                          {it.product_name ?? it.description}
                        </div>
                        {it.product_name && it.description !== it.product_name ? (
                          <div className="text-[10px] text-slate-500">{it.description}</div>
                        ) : null}
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {it.fiscal_source_label}
                        </div>
                        {!it.product_id ? (
                          <div className="text-[10px] text-amber-700">Sem produto</div>
                        ) : null}
                        {it.line_warnings.length > 0 ? (
                          <div className="mt-1 text-[10px] text-amber-800">
                            {it.line_warnings.join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{it.ncm ?? "—"}</td>
                      <td className="px-2 py-2 text-xs">{it.product_nature ?? "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        {it.usage_type === "consumo"
                          ? "Consumo"
                          : it.usage_type === "materia_prima"
                            ? "Matéria-prima"
                            : it.usage_type === "revenda"
                              ? "Revenda"
                              : (
                                  <span className="text-amber-700">
                                    Não informada
                                  </span>
                                )}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs font-semibold text-emerald-900">
                        {it.cfop ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-slate-600 max-w-[120px]">
                        {it.fiscal_rule_name ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtBRL(it.total_price)}</td>
                      <td className="px-2 py-2 text-right">
                        {it.tax_base != null ? fmtBRL(it.tax_base) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.icms_rate)}</td>
                      <td className="px-2 py-2 text-right">
                        {it.icms_value != null ? fmtBRL(it.icms_value) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtBool(it.icms_st)}</td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.icms_st_rate)}</td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.ipi_rate)}</td>
                      <td className="px-2 py-2 text-right">
                        {it.ipi_value != null ? fmtBRL(it.ipi_value) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.pis_rate)}</td>
                      <td className="px-2 py-2 text-right">
                        {it.pis_value != null ? fmtBRL(it.pis_value) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.cofins_rate)}</td>
                      <td className="px-2 py-2 text-right">
                        {it.cofins_value != null ? fmtBRL(it.cofins_value) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.cbs_rate)}</td>
                      <td className="px-2 py-2 text-right">{fmtPct(it.ibs_rate)}</td>
                      <td className="px-2 py-2 text-[10px] text-slate-600">
                        {it.ibs_cbs_classificacao ?? "—"}
                      </td>
                      {isAdmin ? (
                        <td className="px-2 py-2 text-center">
                          <FiscalItemEditButton
                            onClick={() => setEditItem(it)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500">
            <strong>Reaplicar regras</strong> quando há regra cadastrada.{" "}
            <strong>Assistente IA</strong> só quando não há regra — define CFOP e
            alíquotas (pode fazer perguntas). <strong>Editar</strong> para ajuste
            manual. Depois «Fiscal alinhado».
          </p>
        </div>
      ) : null}

      <FiscalItemEditModal
        item={editItem}
        open={editItem != null}
        saving={manualSaveMutation.isPending}
        onClose={() => setEditItem(null)}
        onSave={(itemId, fiscal) => manualSaveMutation.mutate({ itemId, fiscal })}
      />

      <FiscalAiAssistantModal
        open={aiOpen}
        orderLabel={data?.order_number}
        loading={aiLoading}
        description={aiDescription}
        questions={aiQuestions}
        onDescriptionChange={setAiDescription}
        onClose={() => {
          setAiOpen(false);
          setAiDescription("");
          setAiQuestions([]);
        }}
        onSubmit={() => void runAi()}
      />
    </AppPage>
  );
}
