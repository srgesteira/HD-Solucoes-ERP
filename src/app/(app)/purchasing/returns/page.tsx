"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AppPage } from "@/shared/ui/app-page";
import {
  CRONOGRAMA_TOKENS,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { StatusBadge, type StatusTone } from "@/shared/ui/page-helpers";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
import {
  PURCHASE_RETURN_REASON_LABELS,
  type PurchaseReturnReason,
  type PurchaseReturnStatus,
} from "@/modules/reverse/lib/returns-types";

type ReturnTab = "all" | PurchaseReturnStatus;

type Item = {
  id: string;
  return_number: string;
  return_date: string;
  status: PurchaseReturnStatus;
  total_value: number;
  reason: PurchaseReturnReason;
  purchase_order_id: string;
};

const TAB_OPTIONS: Array<{ value: ReturnTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunho" },
  { value: "authorized", label: "Autorizadas" },
  { value: "sent", label: "Enviadas" },
  { value: "cancelled", label: "Canceladas" },
];

async function fetchReturns(): Promise<Item[]> {
  const res = await fetch("/api/purchase-returns", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: Item[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar devoluções");
  return json.items ?? [];
}

const STATUS_LABEL: Record<PurchaseReturnStatus, string> = {
  draft: "Rascunho",
  authorized: "Autorizada",
  sent: "Enviada",
  cancelled: "Cancelada",
};

const STATUS_TONE: Record<PurchaseReturnStatus, StatusTone> = {
  draft: "neutral",
  authorized: "warning",
  sent: "success",
  cancelled: "danger",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export default function PurchaseReturnsListPage() {
  const [activeTab, setActiveTab] = useState<ReturnTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();

  const query = useQuery({
    queryKey: ["purchase-returns"],
    queryFn: fetchReturns,
    staleTime: 30_000,
  });

  const searchHint = parseUniversalSearch(search);
  const filteredItems = useMemo(() => {
    let items = query.data ?? [];
    if (activeTab !== "all") {
      items = items.filter((it) => it.status === activeTab);
    }
    if (!searchHint.text) return items;
    return items.filter((it) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          it.return_number,
          it.return_date,
          it.total_value,
          STATUS_LABEL[it.status],
          PURCHASE_RETURN_REASON_LABELS[it.reason],
          it.purchase_order_id,
        ],
        []
      )
    );
  }, [query.data, activeTab, searchHint]);

  const tableColumns = useMemo((): SortableTableColumn<Item>[] => {
    return [
      {
        key: "return_number",
        label: "Nº devolução",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.return_number,
        truncate: false,
        render: (row) => (
          <Link
            href={`/purchasing/returns/${row.id}`}
            className={CRONOGRAMA_TOKENS.cellLink}
          >
            {row.return_number}
          </Link>
        ),
      },
      {
        key: "return_date",
        label: "Data",
        type: "date",
        width: "w-[12%]",
        accessor: (row) => row.return_date,
        truncate: false,
        render: (row) => (
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
            {formatDate(row.return_date)}
          </span>
        ),
      },
      {
        key: "reason",
        label: "Motivo",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => PURCHASE_RETURN_REASON_LABELS[row.reason],
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {PURCHASE_RETURN_REASON_LABELS[row.reason]}
          </span>
        ),
      },
      {
        key: "total_value",
        label: "Valor",
        type: "number",
        width: "w-[12%]",
        align: "right",
        accessor: (row) => row.total_value,
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {formatBrl(Number(row.total_value))}
          </span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => STATUS_LABEL[row.status],
        truncate: false,
        render: (row) => (
          <StatusBadge tone={STATUS_TONE[row.status]}>
            {STATUS_LABEL[row.status]}
          </StatusBadge>
        ),
      },
      {
        key: "purchase_order_id",
        label: "Pedido origem",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.purchase_order_id,
        truncate: false,
        render: (row) => (
          <Link
            href={`/purchasing/orders/${row.purchase_order_id}`}
            className={CRONOGRAMA_TOKENS.cellLink}
          >
            Ver pedido
          </Link>
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
          placeholder="Buscar nº, motivo, data, valor ou pedido…"
        />
      }
    >
      <SortableTable
        columns={tableColumns}
        data={filteredItems}
        getRowKey={(row) => row.id}
        isLoading={query.isLoading}
        emptyMessage="Nenhuma devolução registada."
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Devoluções de compra"
      description="Cronograma de devoluções — produto devolvido ao fornecedor."
      density="comfortable"
      width="wide"
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ReturnTab)}
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
