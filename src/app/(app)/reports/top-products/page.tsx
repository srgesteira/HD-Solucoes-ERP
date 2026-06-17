"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { AppPage } from "@/shared/ui/app-page";
import { ReportFilters, type ReportDateRange } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { usePermissions } from "@/hooks/use-permissions";

type Row = {
  product_id: string;
  technical_code: string;
  name: string;
  quantity: number;
  revenue: number;
};

function diffDaysInclusive(range: ReportDateRange): number {
  const a = new Date(`${range.from}T12:00:00`).getTime();
  const b = new Date(`${range.to}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 90;
  const d = Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(7, Math.min(365, d));
}

export default function TopProductsReportPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const access = can("sales") || can("reports");

  useEffect(() => {
    if (!permLoading && !access) {
      toast.error("Sem acesso a relatórios de vendas.");
      router.replace("/dashboard");
    }
  }, [permLoading, access, router]);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/top-products?days=${d}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        rows?: Row[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setRows(j.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !access) return;
    void load(days);
  }, [permLoading, access, load, days]);

  const chartData = useMemo(
    () =>
      rows.slice(0, 12).map((r) => ({
        label:
          `${r.technical_code}`.length > 14
            ? `${r.technical_code}`.slice(0, 14) + "…"
            : r.technical_code,
        quantity: r.quantity,
        name: r.name,
      })),
    [rows]
  );

  const tableRows = useMemo(
    () =>
      rows.map((r) => ({
        technical_code: r.technical_code,
        name: r.name,
        quantity: r.quantity,
        revenue: r.revenue,
      })),
    [rows]
  );

  if (permLoading || (!permLoading && !access)) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-brand-700" />
          Produtos mais vendidos
        </span>
      }
      description="Agregação por quantidade nos pedidos de venda no intervalo equivalente ao período seleccionado (máx. 365 dias)."
      density="comfortable"
    >
      <ReportFilters
        loading={loading}
        onApply={(range) => {
          const d = diffDaysInclusive(range);
          setDays(d);
          void load(d);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quantidade vendida (top 12)</CardTitle>
          <CardDescription>Últimos {days} dias</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px] w-full min-w-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => [
                    Number(Array.isArray(value) ? value[0] : value ?? 0),
                    "Quantidade",
                  ]}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.name
                      ? String(payload[0].payload.name)
                      : ""
                  }
                />
                <Bar dataKey="quantity" fill="#0369a1" radius={[0, 4, 4, 0]} name="Qtd" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500 py-8 text-center">
              Sem vendas no período.
            </p>
          )}
        </CardContent>
      </Card>

      <ReportTable
        csvFilename="produtos-mais-vendidos"
        columns={[
          { key: "technical_code", header: "Código técnico" },
          { key: "name", header: "Nome" },
          { key: "quantity", header: "Quantidade" },
          { key: "revenue", header: "Faturamento total" },
        ]}
        rows={tableRows}
      />
    </AppPage>
  );
}
