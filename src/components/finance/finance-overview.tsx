"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { KpiCard } from "@/shared/ui/page-helpers";
import { cn } from "@/shared/utils/cn";

/**
 * Painel do caixa no topo do Financeiro: o que entra/sai nos próximos 7 dias, vencidos,
 * e o saldo previsto mês a mês (com aviso do primeiro mês que não fecha).
 */
type Point = { date: string; inflow: number; outflow: number; net: number; cumulative: number };
type CashFlow = { series: Point[]; summary: { opening_balance: number } };
type Title = { original_amount: number; current_amount?: number | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Erro");
  return j;
}

export function FinanceOverview() {
  const flow = useQuery({
    queryKey: ["finance-overview", "flow"],
    queryFn: () => getJson<CashFlow>("/api/reports/cash-flow?horizon=150"),
    staleTime: 60_000,
  });
  const latePay = useQuery({
    queryKey: ["finance-overview", "late-pay"],
    queryFn: () => getJson<{ data: Title[] }>("/api/finance/payables?overdue=1&limit=100"),
    staleTime: 60_000,
  });
  const lateRec = useQuery({
    queryKey: ["finance-overview", "late-rec"],
    queryFn: () => getJson<{ data: Title[] }>("/api/finance/receivables?overdue=1&limit=100"),
    staleTime: 60_000,
  });

  const series = flow.data?.series ?? [];
  const week = series.slice(0, 7);
  const in7 = week.reduce((a, p) => a + p.inflow, 0);
  const out7 = week.reduce((a, p) => a + p.outflow, 0);
  const sum = (rows?: Title[]) => (rows ?? []).reduce((a, r) => a + Number(r.current_amount ?? r.original_amount ?? 0), 0);
  const opening = flow.data?.summary.opening_balance ?? 0;

  // Agrega por mês: entradas, saídas e saldo acumulado no fim do mês
  const months: { key: string; label: string; inflow: number; outflow: number; end: number }[] = [];
  for (const p of series) {
    const key = p.date.slice(0, 7);
    let m = months.find((x) => x.key === key);
    if (!m) {
      m = { key, label: `${MONTHS[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`, inflow: 0, outflow: 0, end: 0 };
      months.push(m);
    }
    m.inflow += p.inflow;
    m.outflow += p.outflow;
    m.end = p.cumulative;
  }
  const shown = months.slice(0, 5);
  const firstNeg = shown.find((m) => m.end < 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Entra em 7 dias" value={brl(in7)} tone="success" />
        <KpiCard label="Sai em 7 dias" value={brl(out7)} tone={out7 > in7 ? "warning" : "neutral"} />
        <KpiCard
          label="A pagar vencido"
          value={brl(sum(latePay.data?.data))}
          hint={`${latePay.data?.data?.length ?? 0} título(s)`}
          tone={latePay.data?.data?.length ? "danger" : "success"}
        />
        <KpiCard
          label="A receber vencido"
          value={brl(sum(lateRec.data?.data))}
          hint={`${lateRec.data?.data?.length ?? 0} título(s) — cobrar`}
          tone={lateRec.data?.data?.length ? "danger" : "success"}
        />
      </div>

      {opening === 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          O saldo inicial do caixa está zerado, então a projeção começa do zero.{" "}
          <Link href="/settings/company" className="font-medium underline">
            Informe o saldo do extrato em Empresa
          </Link>
          .
        </p>
      ) : null}

      {shown.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Previsão</th>
                {shown.map((m) => (
                  <th key={m.key} className="px-3 py-2 text-right font-medium">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-600">Entradas</td>
                {shown.map((m) => (
                  <td key={m.key} className="px-3 py-1.5 text-right text-emerald-700">
                    {brl(m.inflow)}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-600">Saídas</td>
                {shown.map((m) => (
                  <td key={m.key} className="px-3 py-1.5 text-right text-rose-700">
                    {brl(m.outflow)}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-3 py-1.5">Saldo no fim do mês</td>
                {shown.map((m) => (
                  <td key={m.key} className={cn("px-3 py-1.5 text-right", m.end < 0 ? "bg-rose-50 text-rose-700" : "text-slate-900")}>
                    {brl(m.end)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {firstNeg ? (
            <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              {firstNeg.label} é o primeiro mês que não fecha: faltam {brl(-firstNeg.end)}. Precisa de vendas novas ou
              renegociar prazos de compra.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
