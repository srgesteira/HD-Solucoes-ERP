"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PieChart as PieChartIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReportFilters, type ReportDateRange } from "@/components/reports/report-filters";
import { usePermissions } from "@/hooks/use-permissions";

type FunnelCounts = {
  draft: number;
  sent: number;
  approved: number;
  converted: number;
  rejected: number;
};

type Payload = {
  days: number;
  funnel: FunnelCounts;
  submitted_count: number;
  won_count: number;
  conversion_rate_pct: number | null;
  value_won: number;
  value_lost_rejected: number;
  notes?: string;
};

function diffDaysInclusive(range: ReportDateRange): number {
  const a = new Date(`${range.from}T12:00:00`).getTime();
  const b = new Date(`${range.to}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 365;
  const d = Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(30, Math.min(730, d));
}

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

const FUNNEL_COLORS = ["#94a3b8", "#0369a1", "#0d9488", "#15803d", "#b91c1c"];

export default function QuotesConversionReportPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [days, setDays] = useState(365);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    if (!permLoading && !can("reports")) {
      toast.error("Sem acesso a relatórios.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/quotes-conversion?days=${d}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setData(j);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !can("reports")) return;
    void load(days);
  }, [permLoading, can, load, days]);

  const funnelChartData = useMemo(() => {
    if (!data) return [];
    const f = data.funnel;
    return [
      { name: "Rascunho", value: f.draft },
      { name: "Enviado", value: f.sent },
      { name: "Aprovado", value: f.approved },
      { name: "Convertido", value: f.converted },
      { name: "Rejeitado", value: f.rejected },
    ].filter((x) => x.value > 0);
  }, [data]);

  const comparisonBars = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Valor ganho", value: data.value_won, fill: "#15803d" },
      { name: "Valor perdido (rejeitados)", value: data.value_lost_rejected, fill: "#b91c1c" },
    ];
  }, [data]);

  if (permLoading || (!permLoading && !can("reports"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <PieChartIcon className="h-7 w-7 text-brand-700" aria-hidden />
          Conversão de orçamentos
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Taxa de conversão com base em orçamentos já enviados (exclui rascunho) e
          valores totais ganhos vs. rejeitados no período.
        </p>
      </div>

      <ReportFilters
        loading={loading}
        onApply={(range) => {
          const d = diffDaysInclusive(range);
          setDays(d);
          void load(d);
        }}
      />

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Taxa de conversão</CardDescription>
                <CardTitle className="text-2xl">
                  {data.conversion_rate_pct != null
                    ? `${data.conversion_rate_pct}%`
                    : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Enviados (amostra)</CardDescription>
                <CardTitle className="text-2xl">{data.submitted_count}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ganhos</CardDescription>
                <CardTitle className="text-2xl text-green-800">{data.won_count}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Período (dias)</CardDescription>
                <CardTitle className="text-2xl">{data.days}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funil por estado</CardTitle>
                <CardDescription>Contagem de orçamentos no período.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px] w-full min-w-0 flex items-center justify-center">
                {funnelChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart margin={{ top: 16, right: 120, bottom: 16, left: 16 }}>
                      <Tooltip />
                      <Funnel
                        dataKey="value"
                        nameKey="name"
                        data={funnelChartData}
                        isAnimationActive
                      >
                        {funnelChartData.map((_, i) => (
                          <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                        ))}
                        <LabelList
                          position="right"
                          fill="#334155"
                          stroke="none"
                          dataKey="name"
                        />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-500">Sem dados de funil.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Valor convertido vs. perdido</CardTitle>
                <CardDescription>
                  Ganho: aprovados, convertidos ou com pedido de venda ligado. Perdido:
                  rejeitados.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonBars} margin={{ top: 8, right: 8, bottom: 32, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={48} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number | string) =>
                        new Intl.NumberFormat("pt-BR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(Number(v))
                      }
                    />
                    <Tooltip
                      formatter={(value) =>
                        fmtBrl(
                          Number(
                            Array.isArray(value) ? value[0] : value ?? 0
                          )
                        )
                      }
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {comparisonBars.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
              <CardContent className="pt-0 text-sm text-slate-600 space-y-1">
                <p>
                  <span className="font-medium text-green-800">Ganho: </span>
                  {fmtBrl(data.value_won)}
                </p>
                <p>
                  <span className="font-medium text-red-800">Perdido (rejeitados): </span>
                  {fmtBrl(data.value_lost_rejected)}
                </p>
              </CardContent>
            </Card>
          </div>

          {data.notes ? (
            <p className="text-xs text-slate-500 border-l-2 border-slate-200 pl-3">
              {data.notes}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
