"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { Label } from "@/components/ui/label";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { usePermissions } from "@/hooks/use-permissions";

type SeriesRow = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
};

type CashFlowPayload = {
  series: SeriesRow[];
  summary: {
    horizon_days: number;
    total_projected_inflow: number;
    total_projected_outflow: number;
    negative_days: number;
  };
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function aggregateWeekly(series: SeriesRow[]): SeriesRow[] {
  const out: SeriesRow[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    const last = chunk[chunk.length - 1];
    if (!last) continue;
    out.push({
      date: last.date,
      cumulative: last.cumulative,
      net: chunk.reduce((s, x) => s + x.net, 0),
      inflow: chunk.reduce((s, x) => s + x.inflow, 0),
      outflow: chunk.reduce((s, x) => s + x.outflow, 0),
    });
  }
  return out;
}

export default function CashFlowReportPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [horizon, setHorizon] = useState(90);
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CashFlowPayload | null>(null);

  useEffect(() => {
    if (!permLoading && !can("reports")) {
      toast.error("Sem acesso a relatórios.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/cash-flow?horizon=${horizon}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as CashFlowPayload & {
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setData({
        series: j.series ?? [],
        summary: j.summary,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => {
    if (permLoading || !can("reports")) return;
    void load();
  }, [permLoading, can, load]);

  const chartData = useMemo(() => {
    if (!data?.series.length) return [];
    const s = data.series;
    return granularity === "week" ? aggregateWeekly(s) : s;
  }, [data, granularity]);

  const tableRows = useMemo(
    () =>
      (data?.series ?? []).map((r) => ({
        date: r.date,
        inflow: r.inflow,
        outflow: r.outflow,
        net: r.net,
        cumulative: r.cumulative,
        saldo_negativo: r.cumulative < 0 ? "Sim" : "Não",
      })),
    [data]
  );

  const milestones = useMemo(() => {
    const s = data?.series ?? [];
    const pick = (idx: number) => s[Math.min(idx, s.length - 1)]?.cumulative;
    return {
      d30: pick(30),
      d60: pick(60),
      d90: pick(90),
    };
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
          <Wallet className="h-7 w-7 text-brand-700" aria-hidden />
          Fluxo de caixa projectado
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Entradas por contas a receber (pendente/parcial) e saídas por pedidos de
          compra confirmados. Saldo acumulado no horizonte seleccionado.
        </p>
      </div>

      <ReportFilters
        showPeriod={false}
        actionLabel="Actualizar"
        loading={loading}
        onApply={() => void load()}
      >
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <Label htmlFor="cf-horizon">Horizonte (dias)</Label>
          <select
            id="cf-horizon"
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          >
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <Label htmlFor="cf-gran">Agregação do gráfico</Label>
          <select
            id="cf-gran"
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as "day" | "week")}
          >
            <option value="day">Diária</option>
            <option value="week">Semanal</option>
          </select>
        </div>
      </ReportFilters>

      {loading && !data ? (
        <div className="flex justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Entradas projectadas</CardDescription>
                <CardTitle className="text-lg">
                  {fmtBrl(data.summary.total_projected_inflow)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saídas projectadas</CardDescription>
                <CardTitle className="text-lg">
                  {fmtBrl(data.summary.total_projected_outflow)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Dias com saldo acumulado negativo</CardDescription>
                <CardTitle className="text-lg text-amber-800">
                  {data.summary.negative_days}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo acumulado (fim do horizonte)</CardDescription>
                <CardTitle
                  className={`text-lg ${
                    (data.series.at(-1)?.cumulative ?? 0) < 0
                      ? "text-red-700"
                      : "text-slate-900"
                  }`}
                >
                  {fmtBrl(data.series.at(-1)?.cumulative ?? 0)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo acumulado ~30º dia</CardDescription>
                <CardTitle
                  className={`text-base ${
                    (milestones.d30 ?? 0) < 0 ? "text-red-700" : ""
                  }`}
                >
                  {fmtBrl(milestones.d30 ?? 0)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo acumulado ~60º dia</CardDescription>
                <CardTitle
                  className={`text-base ${
                    (milestones.d60 ?? 0) < 0 ? "text-red-700" : ""
                  }`}
                >
                  {fmtBrl(milestones.d60 ?? 0)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo acumulado ~90º dia</CardDescription>
                <CardTitle
                  className={`text-base ${
                    (milestones.d90 ?? 0) < 0 ? "text-red-700" : ""
                  }`}
                >
                  {fmtBrl(milestones.d90 ?? 0)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldo acumulado projectado</CardTitle>
              <CardDescription>
                Barras vermelhas indicam saldo acumulado negativo nesse ponto.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[320px] w-full min-w-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => String(v).slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) =>
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
                      labelFormatter={(l) => `Data: ${l}`}
                    />
                    <Bar dataKey="cumulative" name="Saldo acumulado" radius={[2, 2, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.cumulative < 0 ? "#b91c1c" : "#0369a1"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500">Sem pontos para o gráfico.</p>
              )}
            </CardContent>
          </Card>

          <ReportTable
            csvFilename="fluxo-caixa-projectado"
            columns={[
              { key: "date", header: "Data" },
              { key: "inflow", header: "Entradas" },
              { key: "outflow", header: "Saídas" },
              { key: "net", header: "Líquido do dia" },
              { key: "cumulative", header: "Saldo acumulado" },
              { key: "saldo_negativo", header: "Saldo negativo?" },
            ]}
            rows={tableRows}
          />
        </>
      ) : null}
    </div>
  );
}
