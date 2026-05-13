"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { usePermissions } from "@/hooks/use-permissions";

type Group = {
  client_name: string;
  client_document: string | null;
  total: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_91_plus: number;
  items: Array<{
    id: string;
    document_number: string | null;
    due_date: string;
    current_amount: number;
    days_late: number;
  }>;
};

type Payload = {
  groups: Group[];
  totals: {
    total: number;
    bucket_1_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_91_plus: number;
  };
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function OverdueReceivablesReportPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    if (!permLoading && !can("reports")) {
      toast.error("Sem acesso a relatórios.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/overdue-receivables", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setData({ groups: j.groups ?? [], totals: j.totals });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !can("reports")) return;
    void load();
  }, [permLoading, can, load]);

  const flatRows =
    data?.groups.flatMap((g) =>
      g.items.map((it) => ({
        client_name: g.client_name,
        document_number: it.document_number ?? "—",
        due_date: it.due_date,
        days_late: it.days_late,
        current_amount: it.current_amount,
      }))
    ) ?? [];

  if (permLoading || (!permLoading && !can("reports"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  const t = data?.totals;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <DollarSign className="h-7 w-7 text-brand-700" aria-hidden />
          Contas a receber vencidas
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Títulos pendentes ou parciais com vencimento anterior a hoje, agrupados por
          cliente. Valores por faixa de dias em atraso.
        </p>
      </div>

      <ReportFilters
        showPeriod={false}
        loading={loading}
        onApply={() => void load()}
      />

      {t ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total em atraso</CardDescription>
              <CardTitle className="text-lg">{fmtBrl(t.total)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>1–30 dias</CardDescription>
              <CardTitle className="text-lg">{fmtBrl(t.bucket_1_30)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>31–60 dias</CardDescription>
              <CardTitle className="text-lg">{fmtBrl(t.bucket_31_60)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>61–90 dias</CardDescription>
              <CardTitle className="text-lg">{fmtBrl(t.bucket_61_90)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>91+ dias</CardDescription>
              <CardTitle className="text-lg text-red-800">{fmtBrl(t.bucket_91_plus)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por cliente</CardTitle>
          <CardDescription>Totais e faixas de atraso (valores em R$).</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportTable
            csvFilename="contas-vencidas-por-cliente"
            columns={[
              { key: "client_name", header: "Cliente" },
              { key: "total", header: "Total em atraso" },
              { key: "bucket_1_30", header: "1–30 d" },
              { key: "bucket_31_60", header: "31–60 d" },
              { key: "bucket_61_90", header: "61–90 d" },
              { key: "bucket_91_plus", header: "91+ d" },
            ]}
            rows={
              data?.groups.map((g) => ({
                client_name: g.client_name,
                total: fmtBrl(g.total),
                bucket_1_30: fmtBrl(g.bucket_1_30),
                bucket_31_60: fmtBrl(g.bucket_31_60),
                bucket_61_90: fmtBrl(g.bucket_61_90),
                bucket_91_plus: fmtBrl(g.bucket_91_plus),
              })) ?? []
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhe dos títulos</CardTitle>
          <CardDescription>Lista plana para análise e exportação.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportTable
            csvFilename="contas-vencidas-titulos"
            columns={[
              { key: "client_name", header: "Cliente" },
              { key: "document_number", header: "Documento" },
              { key: "due_date", header: "Vencimento" },
              { key: "days_late", header: "Dias atraso" },
              { key: "current_amount", header: "Valor (R$)" },
            ]}
            rows={flatRows}
          />
        </CardContent>
      </Card>
    </div>
  );
}
