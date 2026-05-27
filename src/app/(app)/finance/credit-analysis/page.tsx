"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Percent, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import { KpiCard } from "@/components/dashboard/kpi-card";

type CreditRow = {
  id: string;
  sales_order_number: string;
  customer_name: string;
  order_total: number;
  customer_open_balance: number;
  customer_overdue_balance: number;
  customer_score: string | null;
  customer_credit_limit: number | null;
  status: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function CreditAnalysisPage() {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/finance/credit-analysis?status=${encodeURIComponent(filter)}`,
        { credentials: "include" }
      );
      const j = (await res.json()) as {
        data?: CreditRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setRows(j.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string, partial?: boolean) {
    setActing(id);
    try {
      let approved_amount: number | undefined;
      if (partial) {
        const row = rows.find((r) => r.id === id);
        const input = window.prompt(
          `Valor aprovado (total ${fmt(row?.order_total ?? 0)}):`,
          String(row?.order_total ?? 0)
        );
        if (input == null) return;
        approved_amount = parseFloat(input.replace(",", "."));
        if (!Number.isFinite(approved_amount)) throw new Error("Valor inválido");
      }
      const res = await fetch(`/api/finance/credit-analysis/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          approved_amount != null ? { approved_amount } : {}
        ),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Falha ao aprovar");
      toast.success("Crédito aprovado — PCP liberado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setActing(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Motivo da rejeição (obrigatório):");
    if (!reason?.trim()) return;
    setActing(id);
    try {
      const res = await fetch(`/api/finance/credit-analysis/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: reason.trim() }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Falha ao rejeitar");
      toast.success("Crédito rejeitado — PV voltou para pendente em Vendas");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setActing(null);
    }
  }

  const pendingCount = filter === "pending" ? rows.length : undefined;

  return (
    <AppPage
      title="Análise de crédito"
      description="Gate Faturamento → PCP. PVs confirmados em Vendas entram aqui como pendentes."
      wide
    >
      <div className="flex flex-wrap gap-2">
        {[
          ["pending", "Pendentes"],
          ["approved", "Aprovadas"],
          ["rejected", "Rejeitadas"],
          ["all", "Todas"],
        ].map(([k, label]) => (
          <Button
            key={k}
            variant={filter === k ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilter(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {pendingCount != null && (
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard title="Pendentes" value={String(pendingCount)} />
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-slate-600 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 py-8 text-center">
          Nenhuma análise neste filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="border border-slate-200 rounded-lg p-4 bg-white flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
            >
              <div>
                <p className="font-medium text-slate-900">
                  PV {r.sales_order_number} — {r.customer_name}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  Pedido: {fmt(r.order_total)} · Aberto:{" "}
                  {fmt(r.customer_open_balance)} · Vencido:{" "}
                  {fmt(r.customer_overdue_balance)}
                  {r.customer_score ? ` · Score ${r.customer_score}` : ""}
                  {r.customer_credit_limit != null
                    ? ` · Limite ${fmt(r.customer_credit_limit)}`
                    : ""}
                </p>
                <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {r.status}
                </span>
              </div>
              {r.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={acting === r.id}
                    onClick={() => void approve(r.id)}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={acting === r.id}
                    onClick={() => void approve(r.id, true)}
                  >
                    <Percent className="h-4 w-4 mr-1" />
                    Parcial
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={acting === r.id}
                    onClick={() => void reject(r.id)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Rejeitar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppPage>
  );
}
