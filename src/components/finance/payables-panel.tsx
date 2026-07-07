"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
import { usePermissions } from "@/hooks/use-permissions";
import { useMe } from "@/hooks/use-me";
import {
  PAYABLES_LIST_TAB_DEFAULT,
  PAYABLES_LIST_TAB_LABELS,
  PAYABLES_LIST_TABS,
  isPayablesListTab,
  type PayablesListTab,
} from "@/modules/faturamento/lib/payables-list-tabs";
import { formatShortFinanceDescription } from "@/modules/finance/lib/finance-line-format";
import { FinanceRowActions } from "@/components/finance/finance-row-actions";
import { FinanceTitleEditDialog } from "@/components/finance/finance-title-edit-dialog";
import {
  FinanceAmountCell,
  FinanceBalanceCell,
  FinanceDateCell,
  FinanceDirectionBadge,
  FinanceTextCell,
  FINANCE_TABLE_WIDTHS,
} from "@/components/finance/finance-table-ui";

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

type PayablesPanelProps = {
  /** Parent already enforced access (e.g. unified finance tabs). */
  embedded?: boolean;
  showNew?: boolean;
  onShowNewChange?: (open: boolean) => void;
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function initialPayablesListTab(
  searchParams: URLSearchParams,
  embedded: boolean
): PayablesListTab {
  if (!embedded) return PAYABLES_LIST_TAB_DEFAULT;
  const list = searchParams.get("list");
  if (list && isPayablesListTab(list)) return list;
  if (searchParams.get("overdue") === "1") return "all";
  return PAYABLES_LIST_TAB_DEFAULT;
}

function buildPayablesContasUrl(opts: {
  list: PayablesListTab;
  overdue: boolean;
}): string {
  const p = new URLSearchParams({ tab: "pagar" });
  if (opts.list !== "open") p.set("list", opts.list);
  if (opts.overdue) p.set("overdue", "1");
  return `/finance/contas?${p.toString()}`;
}

const PAYABLE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  cancelled: "Cancelado",
};

export function PayablesPanelNewButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" onClick={onClick}>
      <Plus className="h-4 w-4" />
      Nova conta a pagar
    </Button>
  );
}

export function PayablesPanel({
  embedded = false,
  showNew: showNewProp,
  onShowNewChange,
}: PayablesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isLoading: permLoading } = usePermissions();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PayablesListTab>(() =>
    initialPayablesListTab(searchParams, embedded)
  );
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [overdue, setOverdue] = useState(
    () => searchParams.get("overdue") === "1"
  );
  const [supplierId, setSupplierId] = useState("");
  const [showNewInternal, setShowNewInternal] = useState(false);
  const showNew = showNewProp ?? showNewInternal;
  const setShowNew = onShowNewChange ?? setShowNewInternal;
  const [payOpen, setPayOpen] = useState<Payable | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [editOpen, setEditOpen] = useState<Payable | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const p = new URLSearchParams({
        limit: "100",
        page: "1",
        tab: activeTab,
      });
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
  }, [activeTab, overdue, supplierId]);

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
    if (embedded || permLoading) return;
    if (!can("finance")) {
      toast.error("Sem acesso ao módulo Financeiro.");
      router.replace("/dashboard");
    }
  }, [embedded, permLoading, can, router]);

  useEffect(() => {
    if (!embedded) return;
    const isOverdue = searchParams.get("overdue") === "1";
    setOverdue(isOverdue);
    const list = searchParams.get("list");
    if (list && isPayablesListTab(list)) {
      setActiveTab(list);
    } else if (isOverdue) {
      setActiveTab("all");
    }
  }, [embedded, searchParams]);

  const syncEmbeddedUrl = useCallback(
    (list: PayablesListTab, onlyOverdue: boolean) => {
      if (!embedded) return;
      router.replace(
        buildPayablesContasUrl({ list, overdue: onlyOverdue }),
        { scroll: false }
      );
    },
    [embedded, router]
  );

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

  async function submitEdit(data: { amount: number; dueDate: string }) {
    if (!editOpen) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = { due_date: data.dueDate };
      if (Math.abs(data.amount - editOpen.current_amount) > 0.001) {
        body.adjust_amount = data.amount;
      }
      const res = await fetch(`/api/finance/payables/${editOpen.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Erro ao guardar");
        return;
      }
      toast.success("Título actualizado.");
      setEditOpen(null);
      void load();
    } finally {
      setEditSaving(false);
    }
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
    if (!confirm("Excluir esta conta a pagar?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/finance/payables/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Erro");
        return;
      }
      toast.success("Excluído.");
      void load();
    } finally {
      setDeletingId(null);
    }
  }

  const supplierName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? id : "—");
  }, [suppliers]);

  const searchHint = parseUniversalSearch(search);
  const visibleRows = useMemo(() => {
    if (!searchHint.text) return rows;
    return rows.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          row.description,
          row.category,
          supplierName(row.supplier_id),
          row.due_date,
          row.original_amount,
          row.current_amount,
          PAYABLE_STATUS_LABELS[row.status] ?? row.status,
        ],
        []
      )
    );
  }, [rows, searchHint, supplierName]);

  const tableColumns = useMemo((): SortableTableColumn<Payable>[] => {
    return [
      {
        key: "description",
        label: "Descrição",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.description,
        accessor: (row) => formatShortFinanceDescription(row.description),
        render: (row) => {
          const label = formatShortFinanceDescription(row.description);
          if (row.purchase_order_id) {
            return (
              <Link
                href={`/purchasing/orders/${row.purchase_order_id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-900 hover:underline"
              >
                {label}
              </Link>
            );
          }
          return <FinanceTextCell>{label}</FinanceTextCell>;
        },
      },
      {
        key: "entity",
        label: "Entidade",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.entity,
        accessor: (row) => supplierName(row.supplier_id),
        render: (row) => (
          <FinanceTextCell className="text-slate-700">
            {supplierName(row.supplier_id)}
          </FinanceTextCell>
        ),
      },
      {
        key: "direction",
        label: "Tipo",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.type,
        accessor: () => "out",
        render: () => <FinanceDirectionBadge direction="out" />,
      },
      {
        key: "due_date",
        label: "Data",
        type: "date",
        width: FINANCE_TABLE_WIDTHS.date,
        accessor: (row) => row.due_date,
        truncate: false,
        render: (row) => <FinanceDateCell iso={row.due_date} />,
      },
      {
        key: "original_amount",
        label: "Valor",
        type: "number",
        width: FINANCE_TABLE_WIDTHS.amount,
        align: "right",
        accessor: (row) => row.original_amount,
        truncate: false,
        render: (row) => (
          <FinanceAmountCell direction="out" amount={row.original_amount} />
        ),
      },
      {
        key: "current_amount",
        label: "Saldo acumulado",
        type: "number",
        width: FINANCE_TABLE_WIDTHS.balance,
        align: "right",
        accessor: (row) => row.current_amount,
        truncate: false,
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            <FinanceBalanceCell amount={row.current_amount} />
            {row.amount_locked ? (
              <span className="text-xs text-amber-700" title="Ajuste manual">
                *
              </span>
            ) : null}
          </span>
        ),
      },
    ];
  }, [supplierName]);

  if (!embedded && (permLoading || !can("finance"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

  if (embedded && (permLoading || !can("finance"))) {
    return null;
  }

  return (
    <>
      {embedded ? (
        <div className="flex justify-end mb-4">
          <PayablesPanelNewButton onClick={() => setShowNew(true)} />
        </div>
      ) : null}

      {showNew ? (
        <Card className="mb-4">
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
              <BrDateInput
                value={form.due_date || null}
                onChange={(iso) => setForm((f) => ({ ...f, due_date: iso ?? "" }))}
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

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const tab = v as PayablesListTab;
          setActiveTab(tab);
          syncEmbeddedUrl(tab, overdue);
        }}
      >
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {PAYABLES_LIST_TABS.map((tabId) => (
            <TabsTrigger key={tabId} value={tabId} className="text-xs sm:text-sm">
              {PAYABLES_LIST_TAB_LABELS[tabId]}
            </TabsTrigger>
          ))}
        </TabsList>
        {PAYABLES_LIST_TABS.map((tabId) => (
          <TabsContent key={tabId} value={tabId} className="mt-4">
            <CronogramaPanel
              search={
                <>
                  <CronogramaSearch
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder="Buscar descrição, fornecedor, valor, data ou estado…"
                  />
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Fornecedor</Label>
                      <select
                        className="flex h-9 min-w-[11rem] rounded-md border border-slate-300 px-3 text-sm bg-white"
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
                    <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={overdue}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setOverdue(next);
                          const list = next ? "all" : activeTab;
                          if (next) setActiveTab("all");
                          syncEmbeddedUrl(list, next);
                        }}
                      />
                      Só vencidas
                    </label>
                  </div>
                </>
              }
            >
              {overdue ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span>
                    Filtro activo: a mostrar apenas contas{" "}
                    <strong>vencidas</strong>.
                  </span>
                  <button
                    type="button"
                    className="font-medium underline hover:no-underline"
                    onClick={() => {
                      setOverdue(false);
                      syncEmbeddedUrl(activeTab, false);
                    }}
                  >
                    Limpar filtro
                  </button>
                </div>
              ) : null}
              <SortableTable
                columns={tableColumns}
                data={visibleRows}
                getRowKey={(row) => row.id}
                isLoading={loading}
                emptyMessage={`Sem contas em «${PAYABLES_LIST_TAB_LABELS[activeTab]}».`}
                actionsColumn={{
                  label: "Acções",
                  width: "w-[7rem]",
                  render: (r) => {
                    const open =
                      r.status !== "paid" && r.status !== "cancelled";
                    return (
                      <FinanceRowActions
                        canSettle={open}
                        canEdit={open}
                        canDelete={isAdmin}
                        deleting={deletingId === r.id}
                        settleLabel="Concretizar pagamento"
                        onSettle={() => {
                          setPayOpen(r);
                          setPayAmount(String(r.current_amount));
                        }}
                        onEdit={() => setEditOpen(r)}
                        onDelete={() => void removeRow(r.id)}
                      />
                    );
                  },
                }}
              />
            </CronogramaPanel>
          </TabsContent>
        ))}
      </Tabs>

      <FinanceTitleEditDialog
        open={Boolean(editOpen)}
        title="Editar conta a pagar"
        description={editOpen?.description ?? ""}
        currentAmount={editOpen?.current_amount ?? 0}
        originalAmount={editOpen?.original_amount}
        dueDate={editOpen?.due_date ?? ""}
        amountLocked={editOpen?.amount_locked}
        saving={editSaving}
        onClose={() => setEditOpen(null)}
        onSave={submitEdit}
      />

      {payOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Concretizar pagamento</CardTitle>
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
    </>
  );
}
