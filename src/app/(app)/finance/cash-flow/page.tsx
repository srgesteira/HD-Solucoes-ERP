"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { usePermissions } from "@/hooks/use-permissions";

type Entry = {
  id: string;
  type: "in" | "out";
  description: string;
  amount: number;
  date: string;
  category: string | null;
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function FinanceCashFlowEntriesPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [rows, setRows] = useState<Entry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "in" as "in" | "out",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/cash-flow", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        data?: Entry[];
        balance?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      setRows(j.data ?? []);
      setBalance(Number(j.balance ?? 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !can("finance")) {
      toast.error("Sem acesso ao módulo Financeiro.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("finance")) return;
    void load();
  }, [permLoading, can, load]);

  async function submit() {
    const amt = parseFloat(form.amount);
    if (!form.description.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Preencha descrição e valor.");
      return;
    }
    const res = await fetch("/api/finance/cash-flow", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        description: form.description.trim(),
        amount: amt,
        date: form.date,
        category: form.category.trim() || null,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Lançamento criado.");
    setForm({
      type: "in",
      description: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      category: "",
    });
    void load();
  }

  const tableColumns = useMemo((): SortableTableColumn<Entry>[] => {
    return [
      {
        key: "date",
        label: "Data",
        type: "date",
        width: "w-[14%]",
        accessor: (row) => row.date,
        truncate: false,
        render: (row) => (
          <span className="whitespace-nowrap">{row.date}</span>
        ),
      },
      {
        key: "type",
        label: "Tipo",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => (row.type === "in" ? "Entrada" : "Saída"),
      },
      {
        key: "description",
        label: "Descrição",
        type: "text",
        width: "w-[44%]",
        accessor: (row) => row.description,
      },
      {
        key: "amount",
        label: "Valor",
        type: "number",
        width: "w-[30%]",
        align: "right",
        accessor: (row) => row.amount,
        truncate: false,
        render: (row) => (
          <span
            className={`font-medium ${
              row.type === "in" ? "text-green-800" : "text-red-700"
            }`}
          >
            {row.type === "in" ? "+" : "−"}
            {fmtBrl(row.amount)}
          </span>
        ),
      },
    ];
  }, []);

  if (permLoading || (!permLoading && !can("finance"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-7 w-7 text-brand-700" />
          Fluxo de caixa (lançamentos manuais)
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Saldo actual (soma entradas − saídas):{" "}
          <strong className={balance >= 0 ? "text-green-800" : "text-red-700"}>
            {fmtBrl(balance)}
          </strong>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo lançamento</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as "in" | "out" }))
              }
            >
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Descrição</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Categoria (opcional)</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="button" onClick={() => void submit()}>
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <SortableTable
            columns={tableColumns}
            data={rows}
            getRowKey={(row) => row.id}
            isLoading={loading}
            emptyMessage="Sem lançamentos."
          />
        </CardContent>
      </Card>
    </div>
  );
}
