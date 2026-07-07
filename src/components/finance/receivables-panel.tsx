"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  CRONOGRAMA_TOKENS,
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { usePermissions } from "@/hooks/use-permissions";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
import { formatShortDate } from "@/shared/utils/date";

type ReceivableTab = "all" | "pending" | "partial" | "paid" | "cancelled" | "overdue";

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

function formatDate(iso: unknown): string {
  if (iso == null || iso === "") return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

/** Saldo em aberto; para pagos, o valor recebido (não o saldo zero). */
function receivableDisplayAmount(row: ReceivableRow): number {
  if (row.status === "paid") {
    const paid = Number(row.paid_amount ?? 0);
    if (paid > 0.001) return paid;
    return Number(row.original_amount ?? row.current_amount ?? 0);
  }
  return Number(row.current_amount ?? 0);
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
  const { can, isLoading: permLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState<ReceivableTab>("all");
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
  const limit = 25;

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

  const searchHint = parseUniversalSearch(search);
  const visibleRows = useMemo(() => {
    if (!searchHint.text) return rows;
    return rows.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          String(row.client_name ?? ""),
          String(row.due_date ?? ""),
          Number(receivableDisplayAmount(row)),
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
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[24%]",
        accessor: (row) => String(row.client_name ?? ""),
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {String(row.client_name ?? "—")}
          </span>
        ),
      },
      {
        key: "due_date",
        label: "Vencimento",
        type: "date",
        width: "w-[14%]",
        accessor: (row) => row.due_date,
        truncate: false,
        render: (row) => (
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
            {formatDate(row.due_date)}
          </span>
        ),
      },
      {
        key: "current_amount",
        label: "Valor",
        type: "number",
        width: "w-[14%]",
        align: "right",
        accessor: (row) => receivableDisplayAmount(row),
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {fmtBrl(receivableDisplayAmount(row))}
          </span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        type: "text",
        width: "w-[14%]",
        accessor: (row) =>
          RECEIVABLE_STATUS_LABELS[String(row.status ?? "")] ??
          String(row.status ?? ""),
        truncate: false,
        render: (row) => {
          const label =
            RECEIVABLE_STATUS_LABELS[String(row.status ?? "")] ??
            String(row.status ?? "—");
          return (
            <span className={CRONOGRAMA_TOKENS.badge}>{label}</span>
          );
        },
      },
      {
        key: "document",
        label: "Documento",
        type: "text",
        width: "w-[29%]",
        accessor: (row) => (row.sales_order_id ? "Ver pedido" : "—"),
        truncate: false,
        render: (row) =>
          row.sales_order_id ? (
            <Link
              href={`/sales/orders/${String(row.sales_order_id)}`}
              className={CRONOGRAMA_TOKENS.cellLink}
            >
              Ver pedido
            </Link>
          ) : (
            "—"
          ),
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
          width: "w-[8rem]",
          render: (row) =>
            row.status === "pending" || row.status === "partial" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRecvOpen(row);
                  setRecvAmount(String(row.current_amount));
                  setRecvInterest("");
                  setRecvDiscount("");
                  setRecvDate(new Date().toISOString().slice(0, 10));
                }}
              >
                Confirmar recebimento
              </Button>
            ) : null,
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

      {recvOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Confirmar recebimento</CardTitle>
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
