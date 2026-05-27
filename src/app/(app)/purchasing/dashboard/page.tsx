"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";

type PurchasingKpis = {
  pending_purchase_orders: number;
  out_of_stock_items: number;
  avg_purchase_cost_month: number;
  month_purchases_total: number;
  avg_lead_time_days: number | null;
  supplier_delay_rate_pct: number | null;
};

type SavingsData = {
  avg_savings_pct: number | null;
  top_products: Array<{
    name: string;
    code: string | null;
    savings_pct: number;
    previous_price: number;
    current_price: number;
  }>;
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function PurchasingDashboardPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [kpis, setKpis] = useState<PurchasingKpis | null>(null);
  const [savings, setSavings] = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permLoading && !can("purchasing")) {
      toast.error("Sem acesso a este módulo.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("purchasing")) return;
    setLoading(true);
    Promise.all([
      fetch("/api/dashboard/purchasing/kpis", { credentials: "include" }).then(
        (r) => r.json()
      ),
      fetch("/api/dashboard/purchasing/savings", {
        credentials: "include",
      }).then((r) => r.json()),
    ])
      .then(([kpiRes, savRes]) => {
        if (!kpiRes.data) throw new Error(kpiRes.error ?? "Erro nos KPIs");
        if (!savRes.data) throw new Error(savRes.error ?? "Erro na economia");
        setKpis(kpiRes.data as PurchasingKpis);
        setSavings(savRes.data as SavingsData);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, can]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <h2 className="text-2xl font-semibold text-slate-900">
        Dashboard de Compras
      </h2>

      {loading ? (
        <p className="flex items-center gap-2 text-slate-600 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </p>
      ) : kpis && savings ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Economia média"
              value={
                savings.avg_savings_pct != null
                  ? `${savings.avg_savings_pct}%`
                  : "—"
              }
              subtitle="Preço anterior vs custo actual"
            />
            <KpiCard
              title="Lead time médio"
              value={
                kpis.avg_lead_time_days != null
                  ? `${kpis.avg_lead_time_days} dias`
                  : "—"
              }
              subtitle="Entregas recebidas (90 dias)"
            />
            <KpiCard
              title="Taxa de atraso"
              value={
                kpis.supplier_delay_rate_pct != null
                  ? `${kpis.supplier_delay_rate_pct}%`
                  : "—"
              }
              subtitle="Entrega real após a prevista"
            />
            <KpiCard
              title="Pedidos pendentes"
              value={String(kpis.pending_purchase_orders)}
            />
            <KpiCard
              title="Itens em falta"
              value={String(kpis.out_of_stock_items)}
              subtitle="Estoque zerado"
            />
            <KpiCard
              title="Total compras (mês)"
              value={fmtBrl(kpis.month_purchases_total)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Top 5 produtos — maior economia (%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {savings.top_products.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Sem histórico de compra comparável.
                </p>
              ) : (
                <ul className="text-sm space-y-2">
                  {savings.top_products.map((p) => (
                    <li
                      key={`${p.name}-${p.code}`}
                      className="flex justify-between gap-2 border-b border-slate-100 pb-1"
                    >
                      <span className="line-clamp-1">
                        {p.code ? `${p.code} — ` : ""}
                        {p.name}
                      </span>
                      <span className="font-medium tabular-nums text-emerald-700">
                        {p.savings_pct}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
