"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";

type SalesKpis = {
  month_from: string;
  month_to: string;
  total_quotes: number;
  conversion_rate_pct: number | null;
  avg_ticket: number;
  average_ticket: number;
  rejected_count: number;
  top_products: Array<{ name: string; quantity: number }>;
  rejections_by_reason: Array<{ reason: string; count: number }>;
};

type ProfitabilityData = {
  top_products: Array<{
    name: string;
    code: string | null;
    gross_margin: number;
  }>;
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function SalesDashboardPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [data, setData] = useState<SalesKpis | null>(null);
  const [profitability, setProfitability] =
    useState<ProfitabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permLoading && !can("sales")) {
      toast.error("Sem acesso ao módulo de vendas.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("sales")) return;
    setLoading(true);
    Promise.all([
      fetch("/api/dashboard/sales/kpis", { credentials: "include" }).then(
        (r) => r.json()
      ),
      fetch("/api/dashboard/sales/profitability", {
        credentials: "include",
      }).then((r) => r.json()),
    ])
      .then(([kpiRes, profRes]) => {
        if (!kpiRes.data) throw new Error(kpiRes.error ?? "Erro ao carregar KPIs");
        if (!profRes.data)
          throw new Error(profRes.error ?? "Erro na rentabilidade");
        setData(kpiRes.data as SalesKpis);
        setProfitability(profRes.data as ProfitabilityData);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, can]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Dashboard de Vendas
          </h2>
          <p className="text-sm text-slate-500">
            Indicadores do mês ({data?.month_from ?? "…"} a{" "}
            {data?.month_to ?? "…"})
          </p>
        </div>
        <Link href="/sales/quotes" className="text-sm text-brand-700 underline">
          Ver orçamentos
        </Link>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-slate-600 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </p>
      ) : data && profitability ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Orçamentos no mês"
              value={String(data.total_quotes)}
            />
            <KpiCard
              title="Taxa de conversão"
              value={
                data.conversion_rate_pct != null
                  ? `${data.conversion_rate_pct}%`
                  : "—"
              }
              subtitle="Convertidos / enviados"
            />
            <KpiCard
              title="Ticket médio"
              value={fmtBrl(data.average_ticket)}
              subtitle="Pedidos confirmados / entregues"
            />
            <KpiCard
              title="Rejeitados"
              value={String(data.rejected_count)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Top 5 produtos — margem bruta
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profitability.top_products.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem dados no período.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {profitability.top_products.slice(0, 5).map((p) => (
                      <li
                        key={`${p.name}-${p.code}`}
                        className="flex justify-between gap-2 border-b border-slate-100 pb-1"
                      >
                        <span className="line-clamp-1">
                          {p.code ? `${p.code} — ` : ""}
                          {p.name}
                        </span>
                        <span className="font-medium tabular-nums">
                          {fmtBrl(p.gross_margin)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top 5 produtos (qtd.)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.top_products.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem dados no período.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {data.top_products.map((p) => (
                      <li
                        key={p.name}
                        className="flex justify-between gap-2 border-b border-slate-100 pb-1"
                      >
                        <span className="line-clamp-1">{p.name}</span>
                        <span className="font-medium tabular-nums">
                          {p.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Rejeições por motivo</CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                {data.rejections_by_reason.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Sem rejeições no período.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.rejections_by_reason}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="reason" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#b91c1c"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
