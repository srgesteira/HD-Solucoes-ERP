"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Scale,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";
import { useMe } from "@/hooks/use-me";
import type { FiscalRuleRow } from "@/modules/fiscal/lib/fiscal-rules-types";
import { resolveFiscalRule } from "@/modules/fiscal/lib/fiscal-rules-engine";
import type { FiscalInconsistency } from "@/modules/fiscal/lib/fiscal-inconsistency-scan";
import { formatShortDate } from "@/shared/utils/date";

async function fetchRules(): Promise<FiscalRuleRow[]> {
  const res = await fetch("/api/fiscal/rules", { credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as {
    rules?: FiscalRuleRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar regras");
  return json.rules ?? [];
}

async function saveRule(payload: Record<string, unknown>) {
  const res = await fetch("/api/fiscal/rules", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao gravar");
}

async function deleteRule(id: string) {
  const res = await fetch(`/api/fiscal/rules/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao remover");
}

type RuleToReview = {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  last_reviewed_at: string | null;
  review_interval_months: number;
  needs_review: boolean;
  is_expired: boolean;
  is_expiring_soon: boolean;
};

async function fetchRulesToReview(): Promise<{
  items: RuleToReview[];
  total: number;
  expired: number;
  expiringSoon: number;
  needsReview: number;
}> {
  const res = await fetch("/api/fiscal/rules/to-review", {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: RuleToReview[];
    total?: number;
    expired?: number;
    expiringSoon?: number;
    needsReview?: number;
    error?: string;
  };
  if (!res.ok)
    throw new Error(json.error ?? "Erro ao carregar regras a revisar");
  return {
    items: json.items ?? [],
    total: json.total ?? 0,
    expired: json.expired ?? 0,
    expiringSoon: json.expiringSoon ?? 0,
    needsReview: json.needsReview ?? 0,
  };
}

async function markRuleReviewed(id: string) {
  const res = await fetch(`/api/fiscal/rules/${id}/mark-reviewed`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao marcar revisão");
}

type InconsistenciesResponse = {
  issues: FiscalInconsistency[];
  total: number;
  blockers: number;
  warnings: number;
  explanation?: {
    summary: string;
    priorities: string[];
    disclaimer: string;
  };
};

async function fetchInconsistencies(
  explain = false
): Promise<InconsistenciesResponse> {
  const url = explain
    ? "/api/fiscal/inconsistencies?explain=1"
    : "/api/fiscal/inconsistencies";
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as InconsistenciesResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao analisar inconsistências");
  return json;
}

const emptyForm = {
  name: "",
  operation_type: "",
  origin_uf: "",
  destination_uf: "",
  ncm_pattern: "",
  product_prefix_code: "",
  priority: "100",
  cfop: "",
  icms_rate: "",
  ipi_rate: "",
  pis_rate: "",
  cofins_rate: "",
};

export default function FiscalRulesSettingsPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const isAdmin = me?.role === "admin";
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [previewNcm, setPreviewNcm] = useState("84213990");
  const [previewDestUf, setPreviewDestUf] = useState("MG");

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ["fiscal-rules"],
    queryFn: fetchRules,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const reviewQuery = useQuery({
    queryKey: ["fiscal-rules-to-review"],
    queryFn: fetchRulesToReview,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const inconsistencyQuery = useQuery({
    queryKey: ["fiscal-inconsistencies"],
    queryFn: () => fetchInconsistencies(false),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const [aiExplanation, setAiExplanation] = useState<
    InconsistenciesResponse["explanation"] | null
  >(null);
  const [explaining, setExplaining] = useState(false);

  async function runAiExplain() {
    setExplaining(true);
    try {
      const data = await fetchInconsistencies(true);
      setAiExplanation(data.explanation ?? null);
      toast.success("Análise da IA pronta.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na IA");
    } finally {
      setExplaining(false);
    }
  }

  const markReviewedMutation = useMutation({
    mutationFn: markRuleReviewed,
    onSuccess: () => {
      toast.success("Regra marcada como revisada.");
      void queryClient.invalidateQueries({
        queryKey: ["fiscal-rules-to-review"],
      });
      void queryClient.invalidateQueries({ queryKey: ["fiscal-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: saveRule,
    onSuccess: () => {
      toast.success("Regra criada.");
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ["fiscal-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      toast.success("Regra removida.");
      void queryClient.invalidateQueries({ queryKey: ["fiscal-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMemo(() => {
    if (!rules.length) return null;
    return resolveFiscalRule(rules, {
      operationType: "sale",
      originUf: "SP",
      destinationUf: previewDestUf || null,
      taxRegimeId: null,
      companyTaxRegime: null,
      ncm: previewNcm || null,
      productPrefixCode: "HD1",
      productNature: null,
    });
  }, [rules, previewDestUf, previewNcm]);

  if (meLoading) {
    return (
      <AppPage title="Regras fiscais">
        <LoadingState />
      </AppPage>
    );
  }

  if (!isAdmin) {
    return (
      <AppPage title="Regras fiscais" width="narrow">
        <p className="text-sm text-slate-600">
          Apenas administradores podem gerir regras fiscais.
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Regras fiscais
        </span>
      }
      description="Cadastre condições e resultados tributários. Alíquotas ficam vazias até a contadora preencher — o sistema não inventa valores."
      density="comfortable"
    >

      <Card className="border-slate-200">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-brand-700" />
              Assistente de inconsistências fiscais
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Scan determinístico (regras, NCM, pedidos). A IA só explica — não
              decide impostos.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={explaining || inconsistencyQuery.isLoading}
            onClick={() => void runAiExplain()}
          >
            {explaining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Explicar com IA
          </Button>
        </CardHeader>
        <CardContent>
          {inconsistencyQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              A analisar…
            </div>
          ) : inconsistencyQuery.isError ? (
            <p className="text-sm text-red-600">
              {(inconsistencyQuery.error as Error).message}
            </p>
          ) : (inconsistencyQuery.data?.issues.length ?? 0) === 0 ? (
            <p className="text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma inconsistência detectada pelo scan.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inconsistencyQuery.data?.issues.map((issue) => (
                <li key={issue.check_id} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900 flex items-center gap-2">
                        <span
                          className={
                            issue.severity === "blocker"
                              ? "text-[10px] font-semibold uppercase text-red-700 bg-red-50 px-1.5 py-0.5 rounded"
                              : issue.severity === "warning"
                                ? "text-[10px] font-semibold uppercase text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded"
                                : "text-[10px] font-semibold uppercase text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                          }
                        >
                          {issue.severity}
                        </span>
                        {issue.title}
                        {issue.count != null && issue.count > 0 ? (
                          <span className="text-slate-500 font-normal">
                            ({issue.count})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-slate-600 mt-1">{issue.impact}</p>
                      {issue.detail ? (
                        <p className="text-xs text-slate-500 mt-1">{issue.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {aiExplanation ? (
            <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-sm space-y-2">
              <p className="font-medium text-brand-900">Resumo (IA)</p>
              <p className="text-slate-700">{aiExplanation.summary}</p>
              {aiExplanation.priorities.length > 0 ? (
                <ol className="list-decimal list-inside text-slate-700 space-y-1">
                  {aiExplanation.priorities.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              ) : null}
              <p className="text-xs text-slate-500">{aiExplanation.disclaimer}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {reviewQuery.data && reviewQuery.data.total > 0 ? (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-100">
              <AlertCircle className="h-5 w-5" />
              Regras a revisar ({reviewQuery.data.total})
            </CardTitle>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
              §7.7 — regra determinística envelhece. Confirme alíquotas e
              clique em "Marcar como revisada" depois de conferir.{" "}
              {reviewQuery.data.expired > 0
                ? `${reviewQuery.data.expired} vencida(s) · `
                : ""}
              {reviewQuery.data.expiringSoon > 0
                ? `${reviewQuery.data.expiringSoon} expira em até 60 dias · `
                : ""}
              {reviewQuery.data.needsReview > 0
                ? `${reviewQuery.data.needsReview} sem revisão recente`
                : ""}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-amber-200 dark:divide-amber-900">
              {reviewQuery.data.items.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {r.is_expired ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                          <Clock className="h-3 w-3" />
                          VENCIDA
                        </span>
                      ) : r.is_expiring_soon ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          EXPIRA EM BREVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          REVISÃO PENDENTE
                        </span>
                      )}
                      <span className="truncate">{r.name}</span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {r.last_reviewed_at
                        ? `Última revisão: ${formatShortDate(r.last_reviewed_at)}`
                        : "Nunca revisada"}
                      {r.valid_until ? ` · vence ${r.valid_until}` : ""}
                      {" · intervalo "}
                      {r.review_interval_months}m
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={markReviewedMutation.isPending}
                    onClick={() => markReviewedMutation.mutate(r.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Marcar como revisada
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova regra (estrutura)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Venda interestadual MG"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Operação</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={form.operation_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, operation_type: e.target.value }))
              }
            >
              <option value="">Qualquer</option>
              <option value="sale">Venda</option>
              <option value="purchase">Compra</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade (menor = ganha empate)</Label>
            <Input
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({ ...f, priority: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF origem</Label>
            <Input
              maxLength={2}
              value={form.origin_uf}
              onChange={(e) =>
                setForm((f) => ({ ...f, origin_uf: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF destino</Label>
            <Input
              maxLength={2}
              value={form.destination_uf}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  destination_uf: e.target.value.toUpperCase(),
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>NCM (ou prefixo%)</Label>
            <Input
              value={form.ncm_pattern}
              onChange={(e) =>
                setForm((f) => ({ ...f, ncm_pattern: e.target.value }))
              }
              placeholder="8421%"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prefixo produto</Label>
            <Input
              value={form.product_prefix_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_prefix_code: e.target.value }))
              }
              placeholder="HD1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CFOP (resultado)</Label>
            <Input
              value={form.cfop}
              onChange={(e) => setForm((f) => ({ ...f, cfop: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ICMS % (resultado)</Label>
            <Input
              value={form.icms_rate}
              onChange={(e) =>
                setForm((f) => ({ ...f, icms_rate: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>IPI % (resultado)</Label>
            <Input
              value={form.ipi_rate}
              onChange={(e) =>
                setForm((f) => ({ ...f, ipi_rate: e.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <Button
              type="button"
              disabled={createMutation.isPending || !form.name.trim()}
              onClick={() =>
                createMutation.mutate({
                  name: form.name.trim(),
                  operation_type: form.operation_type || null,
                  origin_uf: form.origin_uf || null,
                  destination_uf: form.destination_uf || null,
                  ncm_pattern: form.ncm_pattern || null,
                  product_prefix_code: form.product_prefix_code || null,
                  priority: Number(form.priority) || 100,
                  cfop: form.cfop || null,
                  icms_rate: form.icms_rate ? Number(form.icms_rate) : null,
                  ipi_rate: form.ipi_rate ? Number(form.ipi_rate) : null,
                  pis_rate: form.pis_rate ? Number(form.pis_rate) : null,
                  cofins_rate: form.cofins_rate
                    ? Number(form.cofins_rate)
                    : null,
                })
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2">Criar regra</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview do motor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>NCM teste</Label>
              <Input
                value={previewNcm}
                onChange={(e) => setPreviewNcm(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label>UF destino teste</Label>
              <Input
                value={previewDestUf}
                onChange={(e) => setPreviewDestUf(e.target.value.toUpperCase())}
                className="w-24"
                maxLength={2}
              />
            </div>
          </div>
          {preview ? (
            <p className="text-sm text-slate-700">
              {preview.rule
                ? `Casaria: "${preview.rule.name}" (score ${preview.matchScore}) — ${preview.fiscalStatus}`
                : "Nenhuma regra casaria (no_rules)."}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Cadastre regras para testar.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Regras cadastradas ({rules.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : error ? (
            <p className="text-sm text-red-600">{(error as Error).message}</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma regra — comportamento manual preservado (no_rules).
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.operation_type ?? "qualquer"} · prio {r.priority}
                      {r.destination_uf ? ` · dest ${r.destination_uf}` : ""}
                      {r.ncm_pattern ? ` · NCM ${r.ncm_pattern}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppPage>
  );
}
