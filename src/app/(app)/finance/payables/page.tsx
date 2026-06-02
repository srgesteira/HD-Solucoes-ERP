"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Wallet } from "lucide-react";
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
import { useMe } from "@/hooks/use-me";

type Payable = {
  id: string;
  description: string;
  category: string;
  supplier_id: string | null;
  original_amount: number;
  current_amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  amount_locked?: boolean;
  purchase_order_id?: string | null;
};

type Supplier = { id: string; name: string; code: string };

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

const PAYABLE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  cancelled: "Cancelado",
};

export default function FinancePayablesPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [overdue, setOverdue] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [payOpen, setPayOpen] = useState<Payable | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [adjustOpen, setAdjustOpen] = useState<Payable | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");

  const [form, setForm] = useState({
    description: "",
    category: "Geral",
    supplier_id: "",
    original_amount: "",
    due_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "100", page: "1" });
      if (status !== "all") p.set("status", status);
      if (overdue) p.set("overdue", "1");
      if (supplierId) p.set("supplier_id", supplierId);
      const res = await fetch(`/api/finance/payables?${p}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { data?: Payable[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro");
      setRows((j.data ?? []) as Payable[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [status, overdue, supplierId]);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/purchasing/suppliers?limit=200&page=1", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { data?: Supplier[] };
      if (res.ok) setSuppliers(j.data ?? []);
    } catch {
      setSuppliers([]);
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
    void loadSuppliers();
  }, [permLoading, can, load, loadSuppliers]);

  async function createPayable() {
    const amt = parseFloat(form.original_amount);
    if (!form.description.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Preencha descrição e valor válido.");
      return;
    }
    const res = await fetch("/api/finance/payables", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.description.trim(),
        category: form.category.trim() || "Geral",
        supplier_id: form.supplier_id || null,
        original_amount: amt,
        due_date: form.due_date,
        notes: form.notes || null,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro ao criar");
      return;
    }
    toast.success("Conta a pagar criada.");
    setShowNew(false);
    setForm({
      description: "",
      category: "Geral",
      supplier_id: "",
      original_amount: "",
      due_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    void load();
  }

  async function submitAdjustAmount() {
    if (!adjustOpen) return;
    const amt = parseFloat(adjustAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Indique um valor válido.");
      return;
    }
    const res = await fetch(`/api/finance/payables/${adjustOpen.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjust_amount: amt }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro ao ajustar");
      return;
    }
    toast.success("Valor ajustado e travado para recálculo automático.");
    setAdjustOpen(null);
    setAdjustAmount("");
    void load();
  }

  async function registerPayment() {
    if (!payOpen) return;
    const amt = parseFloat(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Indique o valor do pagamento.");
      return;
    }
    const res = await fetch(`/api/finance/payables/${payOpen.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pay_amount: amt }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Pagamento registado.");
    setPayOpen(null);
    setPayAmount("");
    void load();
  }

  async function removeRow(id: string) {
    if (!confirm("Eliminar esta conta a pagar?")) return;
    const res = await fetch(`/api/finance/payables/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro");
      return;
    }
    toast.success("Eliminado.");
    void load();
  }

  const supplierName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? id : "—");
  }, [suppliers]);

  const tableColumns = useMemo((): SortableTableColumn<Payable>[] => {
    return [
      {
        key: "description",
        label: "Descrição",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => row.description,
      },
      {
        key: "supplier",
        label: "Fornecedor",
        type: "text",
        width: "w-[18%]",
        accessor: (row) => supplierName(row.supplier_id),
      },
      {
        key: "due_date",
        label: "Vencimento",
        type: "date",
        width: "w-[12%]",
        accessor: (row) => row.due_date,
        truncate: false,
        render: (row) => (
          <span className="whitespace-nowrap">{row.due_date}</span>
        ),
      },
      {
        key: "original_amount",
        label: "Original",
        type: "number",
        width: "w-[11%]",
        accessor: (row) => row.original_amount,
        truncate: false,
        render: (row) => (
          <span className="text-slate-600">{fmtBrl(row.original_amount)}</span>
        ),
      },
      {
        key: "current_amount",
        label: "Saldo",
        type: "number",
        width: "w-[11%]",
        accessor: (row) => row.current_amount,
        truncate: false,
        render: (row) => (
          <span>
            {fmtBrl(row.current_amount)}
            {row.amount_locked ? (
              <span className="ml-1 text-xs text-amber-700" title="Ajuste manual">
                *
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        type: "text",
        width: "w-[12%]",
        accessor: (row) =>
          PAYABLE_STATUS_LABELS[row.status] ?? row.status,
      },
    ];
  }, [supplierName]);

  if (permLoading || (!permLoading && !can("finance"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Wallet className="h-7 w-7 text-brand-700" />
            Contas a pagar
          </h1>
          <p className="text-sm text-slate-600 mt-1">Fornecedores, vencimentos e baixas.</p>
        </div>
        <Button type="button" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          <span className="ml-1">Nova conta a pagar</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Estado</Label>
            <select
              className="flex h-9 rounded-md border border-slate-300 px-3 text-sm bg-white"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="overdue">Em atraso</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Fornecedor</Label>
            <select
              className="flex h-9 min-w-[180px] rounded-md border border-slate-300 px-3 text-sm bg-white"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Todos</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => setOverdue(e.target.checked)}
            />
            Só vencidas
          </label>
        </CardContent>
      </Card>

      {showNew ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova conta a pagar</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Fornecedor (opcional)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                value={form.supplier_id}
                onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Valor original (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.original_amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, original_amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Notas</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void createPayable()}>
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem</CardTitle>
        </CardHeader>
        <CardContent>
          <SortableTable
            columns={tableColumns}
            data={rows}
            getRowKey={(row) => row.id}
            isLoading={loading}
            emptyMessage="Sem contas a pagar."
            actionsColumn={{
              label: "Acções",
              width: "w-[5rem]",
              render: (r) => (
                <div className="flex flex-col items-end gap-1">
                  {r.status !== "paid" && r.status !== "cancelled" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAdjustOpen(r);
                          setAdjustAmount(String(r.current_amount));
                        }}
                      >
                        Ajustar valor
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPayOpen(r);
                          setPayAmount(String(r.current_amount));
                        }}
                      >
                        Registrar pagamento
                      </Button>
                    </>
                  ) : null}
                  {isAdmin ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-700"
                      onClick={() => void removeRow(r.id)}
                    >
                      Eliminar
                    </Button>
                  ) : null}
                </div>
              ),
            }}
          />
        </CardContent>
      </Card>

      {adjustOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Ajustar valor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">{adjustOpen.description}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500">Valor original (pedido)</p>
                  <p className="font-medium">{fmtBrl(adjustOpen.original_amount)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Saldo actual</p>
                  <p className="font-medium">{fmtBrl(adjustOpen.current_amount)}</p>
                </div>
              </div>
              {adjustOpen.amount_locked ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Esta parcela já foi ajustada manualmente. Um novo ajuste actualiza o
                  saldo e mantém a trava activa.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Ao confirmar, o valor fica travado e não será alterado por recálculos
                  do pedido de compra.
                </p>
              )}
              <div className="space-y-1">
                <Label>Novo saldo (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAdjustOpen(null);
                    setAdjustAmount("");
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void submitAdjustAmount()}>
                  Confirmar ajuste
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {payOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Registrar pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Saldo actual: {fmtBrl(payOpen.current_amount)}
              </p>
              <div className="space-y-1">
                <Label>Valor a abater (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPayOpen(null)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void registerPayment()}>
                  Confirmar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
