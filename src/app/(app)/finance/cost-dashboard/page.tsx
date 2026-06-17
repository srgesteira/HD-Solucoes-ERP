"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
} from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import { usePermissions } from "@/hooks/use-permissions";

type EvolutionSeries = {
  work_center_id: string;
  code: string;
  name: string;
  points: Array<{
    year: number;
    month: number;
    label: string;
    hourly_rate: number | null;
  }>;
};

type BreakdownLine = {
  work_center_id: string;
  code: string;
  name: string;
  total_hours: number;
  direct_cost: number;
  allocated_cost: number;
  final_cost: number;
  hourly_rate: number;
  direct_hourly_rate: number;
  allocated_hourly_rate: number;
};

type BreakdownDept = {
  department_id: string;
  department_code: string;
  department_name: string;
  allocation_driver: string;
  total_cost: number;
  by_line: Array<{
    work_center_id: string;
    code: string;
    name: string;
    amount: number;
  }>;
};

function fmtBrl(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

const LINE_COLORS = [
  "#1d4ed8",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
];

export default function CostDashboardPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [evolution, setEvolution] = useState<EvolutionSeries[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [breakdown, setBreakdown] = useState<{
    lines: BreakdownLine[];
    departments: BreakdownDept[];
  } | null>(null);

  const access =
    can("finance") || can("production") || can("reports");

  useEffect(() => {
    if (!permLoading && !access) {
      toast.error("Sem acesso ao dashboard de custos.");
      router.replace("/dashboard");
    }
  }, [permLoading, access, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, bdRes] = await Promise.all([
        fetch(
          `/api/cost-dashboard/evolution?year=${year}&month=${month}&months=12`,
          { credentials: "include", cache: "no-store" }
        ),
        fetch(
          `/api/cost-dashboard/breakdown?year=${year}&month=${month}`,
          { credentials: "include", cache: "no-store" }
        ),
      ]);
      const evJ = (await evRes.json()) as {
        series?: EvolutionSeries[];
        periods?: string[];
        error?: string;
      };
      const bdJ = (await bdRes.json()) as {
        lines?: BreakdownLine[];
        departments?: BreakdownDept[];
        error?: string;
      };
      if (!evRes.ok) throw new Error(evJ.error ?? "Erro evolução");
      if (!bdRes.ok) throw new Error(bdJ.error ?? "Erro breakdown");
      setEvolution(evJ.series ?? []);
      setPeriods(evJ.periods ?? []);
      setBreakdown({
        lines: bdJ.lines ?? [],
        departments: bdJ.departments ?? [],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setEvolution([]);
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (permLoading || !access) return;
    void load();
  }, [permLoading, access, load]);

  const lineChartData = useMemo(() => {
    if (periods.length === 0) return [];
    return periods.map((label, idx) => {
      const row: Record<string, string | number | null> = { label };
      for (const s of evolution) {
        const pt = s.points[idx];
        row[s.code || s.name] = pt?.hourly_rate ?? null;
      }
      return row;
    });
  }, [evolution, periods]);

  const stackedBarData = useMemo(() => {
    return (breakdown?.lines ?? []).map((l) => ({
      name: l.code || l.name,
      directo: l.direct_cost,
      rateio: l.allocated_cost,
    }));
  }, [breakdown]);

  if (permLoading || (!permLoading && !access)) {
    return (
      <div className="flex justify-center py-20 gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-brand-700" />
          Dashboard de custos de MO
        </span>
      }
      description="Evolução do custo/hora e composição directo vs rateio por linha."
      density="comfortable"
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="cd-year" className="text-xs">Ano</Label>
            <Input
              id="cd-year"
              type="number"
              className="w-24 h-9"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cd-month" className="text-xs">Mês</Label>
            <Input
              id="cd-month"
              type="number"
              min={1}
              max={12}
              className="w-20 h-9"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          <Button type="button" size="sm" onClick={() => void load()}>
            Actualizar
          </Button>
        </div>
      }
    >

      {loading ? (
        <div className="flex justify-center py-16 gap-2 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" /> A carregar…
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Evolução do custo/hora (12 meses)
              </CardTitle>
              <CardDescription>
                Valores gravados em labor_costs após recálculo.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {lineChartData.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">
                  Sem dados históricos. Recalcule custos em Produção → Linhas.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => fmtBrl(Number(v ?? 0))}
                    />
                    <Legend />
                    {evolution.map((s, i) => (
                      <Line
                        key={s.work_center_id}
                        type="monotone"
                        dataKey={s.code || s.name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Composição do custo — {String(month).padStart(2, "0")}/{year}
              </CardTitle>
              <CardDescription>
                Custo directo (colaboradores na linha) vs rateio (apoio).
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {stackedBarData.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">
                  Sem linhas activas ou sem recálculo para o período.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackedBarData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmtBrl(Number(v ?? 0))} />
                    <Legend />
                    <Bar
                      dataKey="directo"
                      stackId="a"
                      fill="#1d4ed8"
                      name="Directo"
                    />
                    <Bar
                      dataKey="rateio"
                      stackId="a"
                      fill="#f59e0b"
                      name="Rateio"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhe por linha</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2">Linha</th>
                      <th className="text-right px-3 py-2">Horas</th>
                      <th className="text-right px-3 py-2">Directo</th>
                      <th className="text-right px-3 py-2">Rateio</th>
                      <th className="text-right px-3 py-2">Final</th>
                      <th className="text-right px-3 py-2">R$/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(breakdown?.lines ?? []).map((l) => (
                      <tr key={l.work_center_id} className="border-b">
                        <td className="px-3 py-2">
                          {l.code} — {l.name}
                        </td>
                        <td className="px-3 py-2 text-right">{l.total_hours}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtBrl(l.direct_cost)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmtBrl(l.allocated_cost)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {fmtBrl(l.final_cost)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmtBrl(l.hourly_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {(breakdown?.departments?.length ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Contribuição dos departamentos de apoio
                </CardTitle>
                <CardDescription>
                  Quanto cada departamento rateou para cada linha no mês.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {breakdown!.departments.map((d) => (
                  <div key={d.department_id} className="border rounded-lg p-4">
                    <div className="flex flex-wrap justify-between gap-2 mb-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {d.department_code} — {d.department_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Driver: {d.allocation_driver} · Total:{" "}
                          {fmtBrl(d.total_cost)}
                        </p>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="text-left py-1">Linha</th>
                          <th className="text-right py-1">Valor rateado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.by_line.map((bl) => (
                          <tr key={bl.work_center_id}>
                            <td className="py-1">
                              {bl.code} — {bl.name}
                            </td>
                            <td className="py-1 text-right">
                              {fmtBrl(bl.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </AppPage>
  );
}
