"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PieChart } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import { ReportFilters, type ReportDateRange } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";

type Familia = {
  c: string;
  nome: string;
  receita: number;
  custo_padrao: number;
  margem_padrao_pct: number | null;
  direto: Record<string, number>;
  direto_total: number;
  rateio: number;
  margem_real: number;
  margem_real_pct: number | null;
};

type Report = {
  periodo: [string, string];
  familias: Familia[];
  receita_sem_familia: number;
  rateio_base: { apoio: number; producao_sem_familia: number };
  abaixo_da_margem: Record<string, number>;
  sem_classificacao: number;
};

const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const NATURE_LABEL: Record<string, string> = {
  MP: "MP",
  MO: "MO",
  PIN: "Pintura",
  EMB: "Emb.",
  FRT: "Frete",
  REV: "Revenda",
  COM: "Comissão",
};

const BELOW_LABEL: Record<string, string> = {
  "3.01": "Administrativo",
  "3.02": "Comercial / marketing",
  "3.03": "Impostos (DAS)",
  "3.04": "Retirada do sócio",
};

function monthStart(): ReportDateRange {
  const d = new Date();
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return { from, to: d.toISOString().slice(0, 10) };
}

export default function MargemFamiliasPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Report | null>(null);

  const load = useCallback(async (range: ReportDateRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/cost-margin?from=${range.from}&to=${range.to}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as Report & { error?: string };
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
    void load(monthStart());
  }, [load]);

  const rows = useMemo(
    () =>
      (data?.familias ?? []).map((f) => ({
        centro: `${f.c} ${f.nome}`,
        receita: brl(f.receita),
        margem_padrao: f.margem_padrao_pct == null ? "—" : `${f.margem_padrao_pct}%`,
        custo_direto: brl(f.direto_total),
        composicao: Object.entries(f.direto)
          .map(([k, v]) => `${NATURE_LABEL[k] ?? k} ${brl(v)}`)
          .join(" · "),
        rateio: brl(f.rateio),
        margem_real: brl(f.margem_real),
        margem_real_pct: f.margem_real_pct == null ? "—" : `${f.margem_real_pct}%`,
      })),
    [data]
  );

  const totals = useMemo(() => {
    const fs = data?.familias ?? [];
    const receita = fs.reduce((a, f) => a + f.receita, 0);
    const margem = fs.reduce((a, f) => a + f.margem_real, 0);
    const below = Object.values(data?.abaixo_da_margem ?? {}).reduce((a, v) => a + v, 0);
    return { receita, margem, below, resultado: margem - below };
  }, [data]);

  return (
    <AppPage
      title={
        <span className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-brand-700" />
          Margem por família
        </span>
      }
      description="Receita e margem padrão do pedido de venda × custo real (compras e contas classificadas por centro de custo), com rateio do apoio pela participação no faturamento."
      density="comfortable"
    >
      <ReportFilters loading={loading} onApply={(range) => void load(range)} />

      {loading && !data ? (
        <div className="flex justify-center items-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">A calcular…</span>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Receita das famílias", v: brl(totals.receita) },
              { t: "Margem real (após rateio)", v: brl(totals.margem) },
              { t: "Adm, impostos e retirada", v: brl(totals.below) },
              { t: "Resultado do período", v: brl(totals.resultado) },
            ].map((k) => (
              <Card key={k.t}>
                <CardContent className="py-4">
                  <p className="text-xs text-slate-500">{k.t}</p>
                  <p className="text-lg font-semibold text-slate-900">{k.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <ReportTable
            csvFilename="margem-por-familia"
            emptyMessage="Sem vendas ou custos classificados no período."
            columns={[
              { key: "centro", header: "Família" },
              { key: "receita", header: "Receita", align: "right" },
              { key: "margem_padrao", header: "Margem padrão", align: "right" },
              { key: "custo_direto", header: "Custo real direto", align: "right" },
              { key: "composicao", header: "Composição" },
              { key: "rateio", header: "Rateio apoio", align: "right" },
              { key: "margem_real", header: "Margem real", align: "right" },
              { key: "margem_real_pct", header: "Margem real %", align: "right" },
            ]}
            rows={rows}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Base do rateio e abaixo da margem</CardTitle>
              <CardDescription>
                Apoio (galpão, ferramentas, uso e consumo, engenharia) e custos de produção sem família são
                rateados pelo faturamento de cada família.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1 text-slate-700">
              <p>Apoio à produção: {brl(data.rateio_base.apoio)}</p>
              <p>Produção sem família (MP de estoque, MO avulsa, pintura avulsa): {brl(data.rateio_base.producao_sem_familia)}</p>
              {Object.entries(data.abaixo_da_margem).map(([k, v]) => (
                <p key={k}>
                  {BELOW_LABEL[k] ?? k}: {brl(v)}
                </p>
              ))}
              {data.receita_sem_familia ? (
                <p className="text-amber-700">Receita de produtos sem família: {brl(data.receita_sem_familia)}</p>
              ) : null}
              {data.sem_classificacao ? (
                <p className="text-amber-700">Gastos sem classificação: {brl(data.sem_classificacao)}</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </AppPage>
  );
}
