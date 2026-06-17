"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { usePermissions } from "@/hooks/use-permissions";

type Overdue = {
  id: string;
  order_number: string;
  client_name: string | null;
  status: string;
  delivery_deadline: string | null;
  days_overdue: number;
};

type Payload = {
  summary: {
    finished_on_time: number;
    finished_late: number;
    on_time_rate_pct: number | null;
    avg_late_days_when_late: number | null;
    open_overdue_count: number;
  };
  overdue_orders: Overdue[];
};

export default function ProductionDelayReportPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
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
      const res = await fetch("/api/reports/production-delay", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setData({
        summary: j.summary,
        overdue_orders: j.overdue_orders ?? [],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const s = data?.summary;

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <Factory className="h-5 w-5 text-brand-700" />
          Atraso na produção
        </span>
      }
      description="Ordens finalizadas no prazo vs. atrasadas, média de dias de atraso quando atrasadas, e ordens abertas em atraso ou com estado «delayed»."
      density="comfortable"
    >
      <ReportFilters
        showPeriod={false}
        loading={loading}
        onApply={() => void load()}
      />

      {s ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Finalizadas no prazo</CardDescription>
              <CardTitle className="text-2xl">{s.finished_on_time}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Finalizadas em atraso</CardDescription>
              <CardTitle className="text-2xl text-amber-800">
                {s.finished_late}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Taxa no prazo (finalizadas)</CardDescription>
              <CardTitle className="text-2xl">
                {s.on_time_rate_pct != null ? `${s.on_time_rate_pct}%` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Média dias atraso (quando atrasadas)</CardDescription>
              <CardTitle className="text-2xl">
                {s.avg_late_days_when_late != null ? s.avg_late_days_when_late : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordens em atraso / atrasadas</CardTitle>
          <CardDescription>
            {s?.open_overdue_count ?? 0} ordem(ns) listada(s).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportTable
            csvFilename="producao-atraso"
            columns={[
              { key: "order_number", header: "Nº ordem" },
              { key: "client_name", header: "Cliente" },
              { key: "status", header: "Estado" },
              { key: "delivery_deadline", header: "Prazo entrega" },
              { key: "days_overdue", header: "Dias em atraso" },
            ]}
            rows={(data?.overdue_orders ?? []).map((o) => ({
              order_number: o.order_number,
              client_name: o.client_name ?? "—",
              status: o.status,
              delivery_deadline: o.delivery_deadline ?? "—",
              days_overdue: o.days_overdue,
            }))}
          />
        </CardContent>
      </Card>
    </AppPage>
  );
}
