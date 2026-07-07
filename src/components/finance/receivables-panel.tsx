"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
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
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { usePermissions } from "@/hooks/use-permissions";
import { useMe } from "@/hooks/use-me";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
import { formatShortFinanceDescription } from "@/modules/finance/lib/finance-line-format";
import {
  FinanceAmountCell,
  FinanceBalanceCell,
  FinanceDateCell,
  FinanceDirectionBadge,
  FinanceTextCell,
  FINANCE_TABLE_WIDTHS,
} from "@/components/finance/finance-table-ui";
import { FinanceRowActions } from "@/components/finance/finance-row-actions";
import { FinanceTitleEditDialog } from "@/components/finance/finance-title-edit-dialog";

type ReceivableTab = "all" | "pending" | "partial" | "paid" | "cancelled" | "overdue";

function parseReceivableTab(raw: string | null): ReceivableTab {
  if (
    raw === "pending" ||
    raw === "partial" ||
    raw === "paid" ||
    raw === "cancelled" ||
    raw === "overdue"
  ) {
    return raw;
  }
  return "all";
}

function initialReceivableTab(searchParams: URLSearchParams): ReceivableTab {
  if (searchParams.get("overdue") === "1") return "overdue";
  return parseReceivableTab(searchParams.get("status"));
}

type ReceivableRow = {
  id: string;
  client_name: string | null;
  description?: string | null;
  original_amount?: number;
  current_amount: number;
  paid_amount?: number;
  status: string;
  sales_order_id: string | null;
  due_date?: string | null;
};

const TAB_OPTIONS: Array<{ value: ReceivableTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "partial", label: "Parciais" },
  { value: "paid", label: "Pagos" },
  { value: "cancelled", label: "Cancelados" },
  { value: "overdue", label: "Vencidos" },
];

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  cancelled: "Cancelado",
};

type ReceivablesPanelProps = {
  embedded?: boolean;
};

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function receivableValor(row: ReceivableRow): number {
  if (row.status === "paid") {
    return row.paid_amount ?? row.original_amount ?? row.current_amount;
  }
  return row.original_amount ?? row.current_amount;
}

function receivableSaldo(row: ReceivableRow): number {
  if (row.status === "paid") return 0;
  return row.current_amount;
}

export function ReceivablesPanelRefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      Actualizar
    </Button>
  );
}

export function ReceivablesPanel({ embedded = false }: ReceivablesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isLoading: permLoading } = usePermissions();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [activeTab, setActiveTab] = useState<ReceivableTab>(() =>
    embedded ? initialReceivableTab(searchParams) : "all"
  );
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [recvOpen, setRecvOpen] = useState<ReceivableRow | null>(null);
  const [recvAmount, setRecvAmount] = useState("");
  const [recvDate, setRecvDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [recvInterest, setRecvInterest] = useState("");
  const [recvDiscount, setRecvDiscount] = useState("");
  const [editOpen, setEditOpen] = useState<ReceivableRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const limit = 25;

  useEffect(() => {
    if (embedded) {
      setActiveTab(initialReceivableTab(searchParams));
    }
  }, [embedded, searchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, activeTab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (activeTab === "overdue") {
        params.set("overdue", "1");
      } else if (activeTab !== "all") {
        params.set("status", activeTab);
      }
      if (search.trim()) params.set("client", search.trim());
      const res = await fetch(`/api/finance/receivables?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        data?: ReceivableRow[];
        pagination?: { total: number };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar");
      setRows(j.data ?? []);
      setTotal(j.pagination?.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, activeTab, search, limit]);

  useEffect(() => {
    if (embedded || permLoading) return;
    if (!can("finance")) {
      toast.error("Sem acesso ao módulo Financeiro.");
      router.replace("/dashboard");
    }
  }, [embedded, permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("finance")) return;
    void load();
  }, [permLoading, can, load]);

  async function registerReceipt() {
    if (!recvOpen) return;
    const amt = parseFloat(recvAmount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Indique o valor recebido.");
      return;
    }
    if (amt - Number(recvOpen.current_amount) > 0.01) {
      toast.error("O valor não pode ser superior ao saldo actual.");
      return;
    }
    const interest = parseFloat(recvInterest.replace(",", ".") || "0");
    const discount = parseFloat(recvDiscount.replace(",", ".") || "0");
    if (!Number.isFinite(interest) || interest < 0) {
      toast.error("Juros inválidos.");
      return;
    }
    if (!Number.isFinite(discount) || discount < 0) {
      toast.error("Desconto inválido.");
      return;
    }

    const res = await fetch(`/api/finance/receivables/${recvOpen.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        received_amount: amt,
        payment_date: recvDate || undefined,
        interest_adjustment: interest > 0 ? interest : undefined,
        discount_adjustment: discount > 0 ? discount : undefined,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Erro ao registar recebimento");
      return;
    }
    toast.success("Recebimento registado.");
    setRecvOpen(null);
    setRecvAmount("");
    setRecvInterest("");
    setRecvDiscount("");
    setRecvDate(new Date().toISOString().slice(0, 10));
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
      const res = await fetch(`/api/finance/receivables/${editOpen.id}`, {
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

  async function removeRow(id: string) {
    if (!confirm("Excluir esta conta a receber?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/finance/receivables/${id}`, {
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

  const searchHint = parseUniversalSearch(search);
  const visibleRows = useMemo(() => {
    if (!searchHint.text) return rows;
    return rows.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          String(row.client_name ?? ""),
          formatShortFinanceDescription(String(row.description ?? "")),
          String(row.due_date ?? ""),
          receivableValor(row),
          receivableSaldo(row),
          String(row.status ?? ""),
          RECEIVABLE_STATUS_LABELS[String(row.status ?? "")] ?? "",
        ],
        []
      )
    );
  }, [rows, searchHint]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const rangeDescription =
    total === 0
      ? ""
      : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total}`;

  const tableColumns = useMemo((): SortableTableColumn<ReceivableRow>[] => {
    return [
      {
        key: "description",
        label: "Descrição",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.description,
        accessor: (row) =>
          formatShortFinanceDescription(String(row.description ?? "")),
        render: (row) => {
          const label = formatShortFinanceDescription(
            String(row.description ?? row.client_name ?? "—")
          );
          if (row.sales_order_id) {
            return (
              <Link
                href={`/sales/orders/${String(row.sales_order_id)}`}
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
        key: "client_name",
        label: "Entidade",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.entity,
        accessor: (row) => String(row.client_name ?? ""),
        render: (row) => (
          <FinanceTextCell className="text-slate-700">
            {String(row.client_name ?? "—")}
          </FinanceTextCell>
        ),
      },
      {
        key: "direction",
        label: "Tipo",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.type,
        accessor: () => "in",
        render: () => <FinanceDirectionBadge direction="in" />,
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
        key: "valor",
        label: "Valor",
        type: "number",
        width: FINANCE_TABLE_WIDTHS.amount,
        align: "right",
        accessor: (row) => receivableValor(row),
        truncate: false,
        render: (row) => (
          <FinanceAmountCell direction="in" amount={receivableValor(row)} />
        ),
      },
      {
        key: "saldo",
        label: "Saldo acumulado",
        type: "number",
        width: FINANCE_TABLE_WIDTHS.balance,
        align: "right",
        accessor: (row) => receivableSaldo(row),
        truncate: false,
        render: (row) => <FinanceBalanceCell amount={receivableSaldo(row)} />,
      },
    ];
  }, []);

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar cliente, valor, data ou estado…"
        />
      }
      footer={
        total > 0 ? (
          <CronogramaPagination
            page={page}
            totalPages={totalPages}
            rangeDescription={rangeDescription}
            itemCount={visibleRows.length}
            onPageChange={setPage}
          />
        ) : null
      }
    >
      <SortableTable
        columns={tableColumns}
        data={visibleRows}
        getRowKey={(row) => row.id}
        isLoading={loading}
        emptyMessage="Sem registos."
        actionsColumn={{
          label: "Acções",
          width: "w-[7rem]",
          render: (row) => {
            const open =
              row.status === "pending" || row.status === "partial";
            return (
              <FinanceRowActions
                canSettle={open}
                canEdit={open}
                canDelete={isAdmin}
                deleting={deletingId === row.id}
                settleLabel="Concretizar recebimento"
                onSettle={() => {
                  setRecvOpen(row);
                  setRecvAmount(String(row.current_amount));
                  setRecvInterest("");
                  setRecvDiscount("");
                  setRecvDate(new Date().toISOString().slice(0, 10));
                }}
                onEdit={() => setEditOpen(row)}
                onDelete={() => void removeRow(row.id)}
              />
            );
          },
        }}
      />
    </CronogramaPanel>
  );

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
      <div className="flex justify-end mb-4">
        <ReceivablesPanelRefreshButton onClick={() => void load()} loading={loading} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as ReceivableTab);
          setPage(1);
        }}
      >
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TAB_OPTIONS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {listPanel}
          </TabsContent>
        ))}
      </Tabs>

      <FinanceTitleEditDialog
        open={Boolean(editOpen)}
        title="Editar conta a receber"
        description={String(editOpen?.description ?? editOpen?.client_name ?? "")}
        currentAmount={editOpen?.current_amount ?? 0}
        originalAmount={editOpen?.original_amount}
        dueDate={String(editOpen?.due_date ?? "").slice(0, 10)}
        saving={editSaving}
        onClose={() => setEditOpen(null)}
        onSave={submitEdit}
      />

      {recvOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Concretizar recebimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                {recvOpen.client_name ?? "Cliente"} — saldo actual:{" "}
                {fmtBrl(Number(recvOpen.current_amount))}
              </p>
              <div className="space-y-1">
                <Label>Valor recebido (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={recvAmount}
                  onChange={(e) => setRecvAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Data do recebimento</Label>
                <BrDateInput
                  value={recvDate || null}
                  onChange={(iso) => setRecvDate(iso ?? "")}
                />
              </div>
              <div className="space-y-1">
                <Label>Juros (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={recvInterest}
                  onChange={(e) => setRecvInterest(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Desconto (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={recvDiscount}
                  onChange={(e) => setRecvDiscount(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRecvOpen(null)}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void registerReceipt()}>
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
