"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Percent, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import type { Tables } from "@/lib/types/database";
import type { BdiSettingsSlice } from "@/lib/pricing/bdi-calculate";
import {
  approximateBdiBreakdown,
  calculateBdiSellingPrice,
  defaultBdiSettings,
  totalTaxPctFromSettingsOrCompany,
} from "@/lib/pricing/bdi-calculate";

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(n ?? 0));
}

type ApiGetResponse = {
  data: Tables<"bdi_settings"> | null;
  slice: BdiSettingsSlice;
  company_tax_regime: string | null;
  company_das_aliquot: number | null;
};

async function fetchBdi(): Promise<ApiGetResponse> {
  const res = await fetch("/api/settings/bdi", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiGetResponse & {
    error?: string;
  };
  if (!res.ok)
    throw new Error(json.error ?? "Erro ao carregar configuração BDI");
  if (!json.slice) throw new Error("Resposta inválida.");
  return json as ApiGetResponse;
}

async function saveBdi(
  payload: Partial<Record<string, number | boolean>>
): Promise<ApiGetResponse> {
  const res = await fetch("/api/settings/bdi", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as ApiGetResponse & {
    error?: string;
  };
  if (!res.ok)
    throw new Error(json.error ?? "Erro ao gravar configuração BDI");
  if (!json.slice) throw new Error("Resposta inválida.");
  return json as ApiGetResponse;
}

function pctField(
  value: number,
  onChange: (v: number) => void,
  id: string,
  label: string
) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        min={0}
        max={999}
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) =>
          onChange(Math.max(0, parseFloat(e.target.value) || 0))
        }
      />
    </div>
  );
}

export default function BdiSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["settings-bdi"],
    queryFn: fetchBdi,
    enabled: !meLoading && me?.role === "admin",
  });

  const [draft, setDraft] = useState<BdiSettingsSlice>(defaultBdiSettings());
  const [companyTaxRegime, setCompanyTaxRegime] = useState<string | null>(null);
  const [companyDasAliquot, setCompanyDasAliquot] = useState<number | null>(null);

  const isSimples = companyTaxRegime === "simples_nacional";

  useEffect(() => {
    if (apiData?.slice) setDraft(apiData.slice);
    if (apiData) {
      setCompanyTaxRegime(apiData.company_tax_regime ?? null);
      setCompanyDasAliquot(
        apiData.company_das_aliquot != null &&
          Number.isFinite(apiData.company_das_aliquot)
          ? apiData.company_das_aliquot
          : null
      );
    }
  }, [apiData]);

  useEffect(() => {
    if (meLoading) return;
    if (me && me.role !== "admin") {
      toast.error("Acesso reservado a administradores.");
      router.replace("/settings/profile");
    }
  }, [me, meLoading, router]);

  const previewCost = 100;
  const previewPrice = useMemo(
    () =>
      calculateBdiSellingPrice({
        cost: previewCost,
        settings: draft,
        companyTaxRegime,
        companyDasAliquot,
      }),
    [draft, companyTaxRegime, companyDasAliquot]
  );

  const previewBreakdown = useMemo(() => {
    const tax = totalTaxPctFromSettingsOrCompany(
      draft,
      companyTaxRegime,
      companyDasAliquot
    );
    return approximateBdiBreakdown(previewCost, previewPrice, {
      taxes: tax,
      admin: draft.admin_overhead,
      commercial: draft.commercial_overhead,
      financial: draft.financial_overhead,
      profit: draft.profit_margin,
    }).map((b) => {
      const pct = previewPrice > 0 ? (b.amount / previewPrice) * 100 : 0;
      return {
        ...b,
        pct,
      };
    });
  }, [draft, previewPrice, companyTaxRegime, companyDasAliquot]);

  const saveMut = useMutation({
    mutationFn: saveBdi,
    onSuccess: () => {
      toast.success("Configuração BDI guardada.");
      void queryClient.invalidateQueries({ queryKey: ["settings-bdi"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (meLoading || (me && me.role !== "admin")) {
    return (
      <div className="max-w-3xl mx-auto py-16 flex justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar permissões…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/settings/profile"
          className="text-sm text-brand-700 hover:underline"
        >
          Configurações
        </Link>
        <span className="text-slate-400">/</span>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Percent className="h-7 w-7 text-brand-700" aria-hidden />
          BDI precificação
        </h1>
      </div>

      <p className="text-sm text-slate-600">
        Parâmetros de impostos, despesas indirectas e margem para geração de preço
        de venda a partir do custo (
        {draft.use_compound_bdi ? "BDI composto" : "BDI simples"}).
        {isSimples ?
          " Regime Simples Nacional: a carga fiscal do modelo segue a alíquota DAS definida em Configurações da empresa."
        : null}
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate({
              tax_icms: isSimples ? 0 : draft.tax_icms,
              tax_pis: isSimples ? 0 : draft.tax_pis,
              tax_cofins: isSimples ? 0 : draft.tax_cofins,
              tax_ipi: isSimples ? 0 : draft.tax_ipi,
              tax_iss: isSimples ? 0 : draft.tax_iss,
              admin_overhead: draft.admin_overhead,
              commercial_overhead: draft.commercial_overhead,
              financial_overhead: draft.financial_overhead,
              profit_margin: draft.profit_margin,
              use_compound_bdi: draft.use_compound_bdi,
              min_markup: draft.min_markup,
              max_markup: draft.max_markup,
            });
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Parametrização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div>
                <h3 className="text-sm font-medium text-slate-800 mb-3 dark:text-slate-100">
                  Impostos sobre o preço (%)
                </h3>
                {isSimples ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    ICMS, PIS, COFINS, IPI e ISS não são usados no cálculo automático em
                    Simples Nacional. Utilize a alíquota DAS em{" "}
                    <a
                      href="/settings/company"
                      className="text-brand-700 font-medium hover:underline"
                    >
                      Configurações da empresa
                    </a>
                    {companyDasAliquot != null ?
                      ` (actualmente ${companyDasAliquot}%).`
                    : " (ainda não definida)."}
                  </p>
                ) : (
                  <div className="grid sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {pctField(
                      draft.tax_icms,
                      (v) => setDraft((d) => ({ ...d, tax_icms: v })),
                      "tax_icms",
                      "ICMS"
                    )}
                    {pctField(
                      draft.tax_pis,
                      (v) => setDraft((d) => ({ ...d, tax_pis: v })),
                      "tax_pis",
                      "PIS"
                    )}
                    {pctField(
                      draft.tax_cofins,
                      (v) => setDraft((d) => ({ ...d, tax_cofins: v })),
                      "tax_cofins",
                      "COFINS"
                    )}
                    {pctField(
                      draft.tax_ipi,
                      (v) => setDraft((d) => ({ ...d, tax_ipi: v })),
                      "tax_ipi",
                      "IPI"
                    )}
                    {pctField(
                      draft.tax_iss,
                      (v) => setDraft((d) => ({ ...d, tax_iss: v })),
                      "tax_iss",
                      "ISS"
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-800 mb-3 dark:text-slate-100">
                  Despesas (%)
                </h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {pctField(
                    draft.admin_overhead,
                    (v) =>
                      setDraft((d) => ({ ...d, admin_overhead: v })),
                    "admin_overhead",
                    "Administrativas"
                  )}
                  {pctField(
                    draft.commercial_overhead,
                    (v) =>
                      setDraft((d) => ({ ...d, commercial_overhead: v })),
                    "commercial_overhead",
                    "Comerciais"
                  )}
                  {pctField(
                    draft.financial_overhead,
                    (v) =>
                      setDraft((d) => ({ ...d, financial_overhead: v })),
                    "financial_overhead",
                    "Financeiras"
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                {pctField(
                  draft.profit_margin,
                  (v) => setDraft((d) => ({ ...d, profit_margin: v })),
                  "profit_margin",
                  "Margem de lucro (%)"
                )}
                {pctField(
                  draft.min_markup,
                  (v) => setDraft((d) => ({ ...d, min_markup: v })),
                  "min_markup",
                  "Markup mínimo (%)"
                )}
                {pctField(
                  draft.max_markup,
                  (v) => setDraft((d) => ({ ...d, max_markup: v })),
                  "max_markup",
                  "Markup máximo (%)"
                )}
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="use_compound"
                  checked={draft.use_compound_bdi}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      use_compound_bdi: e.target.checked,
                    }))
                  }
                  className={cn(
                    "mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700",
                    "focus-visible:ring-2 focus-visible:ring-brand-700"
                  )}
                />
                <Label htmlFor="use_compound" className="font-normal text-sm">
                  Usar BDI composto (divisor)
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Impacto — custo exemplo R$ 100</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-slate-600 dark:text-slate-400">
                Preço estimado{" "}
                <strong className="text-emerald-800 dark:text-emerald-400">
                  {fmtBRL(previewPrice)}
                </strong>
              </p>
              <div className="flex h-6 w-full overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
                {previewBreakdown.map((seg) => (
                  <div
                    key={seg.label}
                    className={seg.color ?? "bg-slate-400"}
                    style={{
                      flex: `${Math.max(seg.pct || 0, 0)} 1 0%`,
                    }}
                    title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
                  />
                ))}
              </div>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {previewBreakdown.map((seg) => (
                  <li key={seg.label} className="flex justify-between gap-4">
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-5 rounded-sm ${seg.color ?? "bg-slate-400"}`}
                      />
                      {seg.label}
                    </span>
                    <span className="tabular-nums font-medium">
                      {fmtBRL(seg.amount)} ({seg.pct.toFixed(1)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> A gravar…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Guardar
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
