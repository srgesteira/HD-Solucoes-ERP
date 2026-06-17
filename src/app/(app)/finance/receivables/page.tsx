"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
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

type Row = Record<string, unknown>;

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

export default function FinanceReceivablesPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState<ReceivableTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
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
        data?: Row[];
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
    if (!permLoading && !can("finance")) {
      toast.error("Sem acesso ao módulo Financeiro.");
      router.replace("/dashboard");
    }
  }, [permLoading, can, router]);

  useEffect(() => {
    if (permLoading || !can("finance")) return;
    void load();
  }, [permLoading, can, load]);

  const searchHint = parseUniversalSearch(search);
  const visibleRows = useMemo(() => {
    if (!searchHint.text) return rows;
    return rows.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          String(row.client_name ?? ""),
          String(row.due_date ?? ""),
          Number(row.current_amount ?? 0),
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

  const tableColumns = useMemo((): SortableTableColumn<Row>[] => {
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
        accessor: (row) => Number(row.current_amount ?? 0),
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {fmtBrl(Number(row.current_amount ?? 0))}
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

  if (permLoading || (!permLoading && !can("finance"))) {
    return (
      <div className="flex justify-center items-center gap-2 py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">A validar acesso…</span>
      </div>
    );
  }

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
        getRowKey={(row) => String(row.id)}
        isLoading={loading}
        emptyMessage="Sem registos."
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Contas a receber"
      description="Cronograma financeiro — títulos por vencimento e estado."
      density="comfortable"
      width="wide"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      }
    >
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
    </AppPage>
  );
}
