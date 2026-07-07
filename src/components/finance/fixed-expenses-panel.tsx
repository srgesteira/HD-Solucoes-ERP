"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import {
  CRONOGRAMA_TOKENS,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";

type FixedExpense = {
  id: string;
  description: string;
  amount: number;
  due_day: number;
  cost_center_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
};

type FormState = {
  description: string;
  amount: string;
  due_day: string;
  cost_center_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  override_competencia: string;
  override_amount: string;
};

const EMPTY_FORM = (): FormState => ({
  description: "",
  amount: "",
  due_day: "10",
  cost_center_type: "fixed",
  is_active: true,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  override_competencia: new Date().toISOString().slice(0, 7),
  override_amount: "",
});

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export function FixedExpensesPanel({
  embedded: _embedded = false,
}: {
  embedded?: boolean;
}) {
  const [rows, setRows] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/fixed-expenses", {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
      setRows(json.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar contas fixas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchHint = parseUniversalSearch(search);
  const filtered = useMemo(() => {
    if (!searchHint.text) return rows;
    return rows.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          row.description,
          row.cost_center_type,
          String(row.due_day),
          fmtBrl(row.amount),
          row.is_active ? "ativa" : "inativa",
        ],
        []
      )
    );
  }, [rows, searchHint]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM());
    setShowForm(true);
  };

  const openEdit = (row: FixedExpense) => {
    setEditingId(row.id);
    setForm({
      description: row.description,
      amount: String(row.amount),
      due_day: String(row.due_day),
      cost_center_type: row.cost_center_type || "fixed",
      is_active: row.is_active,
      start_date: row.start_date?.slice(0, 10) ?? "",
      end_date: row.end_date?.slice(0, 10) ?? "",
      override_competencia: new Date().toISOString().slice(0, 7),
      override_amount: "",
    });
    setShowForm(true);
  };

  const save = async () => {
    const description = form.description.trim();
    if (!description) {
      toast.error("Informe a descrição");
      return;
    }
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Valor inválido");
      return;
    }
    const due_day = parseInt(form.due_day, 10);
    if (!Number.isFinite(due_day) || due_day < 1 || due_day > 31) {
      toast.error("Dia de vencimento deve ser entre 1 e 31");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        description,
        amount,
        due_day,
        cost_center_type: form.cost_center_type.trim() || "fixed",
        is_active: form.is_active,
        start_date: form.start_date,
        end_date: form.end_date.trim() ? form.end_date : null,
      };

      if (editingId && form.override_amount.trim()) {
        payload.override_competencia = form.override_competencia;
        payload.override_amount = parseFloat(
          form.override_amount.replace(",", ".")
        );
      }

      const res = await fetch(
        editingId
          ? `/api/finance/fixed-expenses/${editingId}`
          : "/api/finance/fixed-expenses",
        {
          method: editingId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");

      toast.success(editingId ? "Conta fixa atualizada" : "Conta fixa criada");
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: FixedExpense) => {
    try {
      const res = await fetch(`/api/finance/fixed-expenses/${row.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar");
      toast.success(row.is_active ? "Conta desativada" : "Conta reativada");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  };

  const columns: SortableTableColumn<FixedExpense>[] = [
    {
      key: "description",
      label: "Descrição",
      type: "text",
      accessor: (row) => row.description,
      render: (row) => (
        <span className={CRONOGRAMA_TOKENS.cellText}>{row.description}</span>
      ),
    },
    {
      key: "amount",
      label: "Valor",
      type: "number",
      align: "right",
      accessor: (row) => row.amount,
      render: (row) => (
        <span className="tabular-nums">{fmtBrl(row.amount)}</span>
      ),
    },
    {
      key: "due_day",
      label: "Dia",
      type: "number",
      accessor: (row) => row.due_day,
      render: (row) => (
        <span className={CRONOGRAMA_TOKENS.cellMuted}>dia {row.due_day}</span>
      ),
    },
    {
      key: "cost_center_type",
      label: "Centro",
      type: "text",
      accessor: (row) => row.cost_center_type,
      render: (row) => (
        <span className={CRONOGRAMA_TOKENS.badge}>{row.cost_center_type}</span>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      type: "text",
      accessor: (row) => (row.is_active ? "ativa" : "inativa"),
      render: (row) => (
        <span
          className={
            row.is_active
              ? "text-emerald-700 text-sm font-medium"
              : "text-slate-500 text-sm"
          }
        >
          {row.is_active ? "Ativa" : "Inativa"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      type: "text",
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openEdit(row)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void toggleActive(row)}
          >
            {row.is_active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <CronogramaPanel
      search={
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CronogramaSearch value={searchInput} onChange={setSearchInput} />
          <Button type="button" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Adicionar conta fixa
          </Button>
        </div>
      }
    >

      {showForm ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              {editingId ? "Editar conta fixa" : "Nova conta fixa"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="fe-desc">Descrição</Label>
              <Input
                id="fe-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Ex.: Aluguel, Energia, Internet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe-amount">Valor base (R$)</Label>
              <Input
                id="fe-amount"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe-day">Dia de vencimento (1–31)</Label>
              <Input
                id="fe-day"
                value={form.due_day}
                onChange={(e) =>
                  setForm((f) => ({ ...f, due_day: e.target.value }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe-center">Centro de custo</Label>
              <Input
                id="fe-center"
                value={form.cost_center_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cost_center_type: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe-start">Início</Label>
              <BrDateInput
                id="fe-start"
                value={form.start_date}
                onChange={(v) =>
                  setForm((f) => ({ ...f, start_date: v ?? "" }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe-end">Fim (opcional)</Label>
              <BrDateInput
                id="fe-end"
                value={form.end_date}
                onChange={(v) => setForm((f) => ({ ...f, end_date: v ?? "" }))}
              />
            </div>
            {editingId ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fe-ov-comp">Override competência (YYYY-MM)</Label>
                  <Input
                    id="fe-ov-comp"
                    value={form.override_competencia}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        override_competencia: e.target.value,
                      }))
                    }
                    placeholder="2026-07"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fe-ov-amt">Valor deste mês (opcional)</Label>
                  <Input
                    id="fe-ov-amt"
                    value={form.override_amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, override_amount: e.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="Deixe vazio para usar valor base"
                  />
                </div>
              </>
            ) : null}
            <div className="sm:col-span-2 flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <SortableTable
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        density="cronograma"
        isLoading={loading}
        emptyMessage="Nenhuma conta fixa cadastrada."
      />
    </CronogramaPanel>
  );
}
