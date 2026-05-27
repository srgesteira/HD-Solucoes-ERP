"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { ReportTable } from "@/components/reports/report-table";
import { usePermissions } from "@/hooks/use-permissions";

type Row = {
  work_center_id: string;
  code: string;
  name: string;
  is_active: boolean;
  default_monthly_hours: number;
  hourly_rate: number | null;
  total_salary_base: number | null;
  total_hours_base: number | null;
  calculated_at: string | null;
};

type Payload = {
  year: number;
  month: number;
  rows: Row[];
};

function fmtBrl(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function LaborCostReportPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);

  const access = can("production") || can("reports");

  useEffect(() => {
    if (!permLoading && !access) {
      toast.error("Sem acesso a relatórios de produção.");
      router.replace("/dashboard");
    }
  }, [permLoading, access, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/labor-cost?year=${year}&month=${month}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setData({ year: j.year, month: j.month, rows: j.rows ?? [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (permLoading || !access) return;
    void load();
  }, [permLoading, access, load]);

  if (permLoading || (!permLoading && !access)) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const tableRows = rows.map((r) => ({
    code: r.code,
    name: r.name,
    ativo: r.is_active ? "Sim" : "Não",
    horas_padrao: r.default_monthly_hours,
    custo_hora: fmtBrl(r.hourly_rate),
    total_salarios: fmtBrl(r.total_salary_base),
    total_horas: r.total_hours_base ?? "—",
    calculado_em:
      r.calculated_at ?
        new Date(r.calculated_at).toLocaleString("pt-BR")
      : "—",
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Calculator className="h-7 w-7 text-brand-700" aria-hidden />
          Custo de mão de obra por linha
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Valores gravados pelo recálculo mensal (salários dos colaboradores ativos na linha ÷
          horas padrão × número de colaboradores).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Período</CardTitle>
          <CardDescription>Ano e mês do snapshot em labor_costs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label htmlFor="lc-year">Ano</Label>
            <Input
              id="lc-year"
              type="number"
              min={2000}
              max={2100}
              className="w-28"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lc-month">Mês (1–12)</Label>
            <Input
              id="lc-month"
              type="number"
              min={1}
              max={12}
              className="w-24"
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10) || month)}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Linhas — {month}/{year}
          </CardTitle>
          {loading ? (
            <CardDescription>A carregar…</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <ReportTable
            columns={[
              { key: "code", header: "Código" },
              { key: "name", header: "Linha" },
              { key: "ativo", header: "Ativo" },
              { key: "horas_padrao", header: "Horas/mês" },
              { key: "custo_hora", header: "Custo/hora" },
              { key: "total_salarios", header: "Total salários" },
              { key: "total_horas", header: "Total horas base" },
              { key: "calculado_em", header: "Calculado em" },
            ]}
            rows={tableRows}
            csvFilename={`custo-mo-${year}-${month}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
