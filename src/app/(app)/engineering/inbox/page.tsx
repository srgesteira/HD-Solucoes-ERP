"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaLoading,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { StatusBadge } from "@/shared/ui/page-helpers";
import type { EngineeringDemandRow } from "@/modules/engenharia/lib/products/engineering-demands";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";
import { formatBrl } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";

type SortMode = "urgency" | "oldest";

async function fetchDemands(sort: SortMode): Promise<EngineeringDemandRow[]> {
  const res = await fetch(`/api/engineering/demands?sort=${sort}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: EngineeringDemandRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar fila");
  return json.items ?? [];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const formatted = formatShortDate(iso);
  return formatted === "--" ? "—" : formatted;
}

export default function EngineeringInboxPage() {
  const [sort, setSort] = useState<SortMode>("urgency");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();

  const query = useQuery({
    queryKey: ["engineering-demands", sort],
    queryFn: () => fetchDemands(sort),
    staleTime: 30_000,
  });

  const searchHint = parseUniversalSearch(search);
  const filtered = useMemo(() => {
    const items = query.data ?? [];
    if (!searchHint.text) return items;
    return items.filter((row) =>
      matchesUniversalSearchRow(
        searchHint,
        [
          row.product_code,
          row.product_name,
          row.client_name,
          row.quote_number,
          row.quote_total,
          row.origin,
        ],
        []
      )
    );
  }, [query.data, searchHint]);

  const columns = useMemo((): SortableTableColumn<EngineeringDemandRow>[] => {
    return [
      {
        key: "product_code",
        label: "Produto",
        type: "text",
        width: "w-[14%]",
        accessor: (r) => r.product_code,
        render: (r) => (
          <Link
            href={`/products/${r.product_id}/edit`}
            className={CRONOGRAMA_TOKENS.cellLink}
          >
            {r.product_code ?? "—"}
          </Link>
        ),
      },
      {
        key: "product_name",
        label: "Descrição",
        type: "text",
        width: "w-[22%]",
        accessor: (r) => r.product_name,
      },
      {
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[14%]",
        accessor: (r) => r.client_name,
      },
      {
        key: "quote_total",
        label: "Valor travado",
        type: "number",
        width: "w-[12%]",
        align: "right",
        accessor: (r) => r.quote_total,
        render: (r) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {formatBrl(r.quote_total)}
          </span>
        ),
      },
      {
        key: "blocked_quotes_count",
        label: "Orçamentos",
        type: "number",
        width: "w-[10%]",
        align: "center",
        accessor: (r) => r.blocked_quotes_count,
      },
      {
        key: "composition_requested_at",
        label: "Desde",
        type: "date",
        width: "w-[10%]",
        accessor: (r) => r.composition_requested_at,
        render: (r) => formatDate(r.composition_requested_at),
      },
      {
        key: "origin",
        label: "Origem",
        type: "text",
        width: "w-[10%]",
        accessor: (r) => r.origin,
        render: (r) =>
          r.origin === "commercial" ? (
            <StatusBadge tone="warning">Comercial</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Interna</StatusBadge>
          ),
      },
    ];
  }, []);

  return (
    <AppPage
      title="Inbox — Engenharia"
      description="Demandas de estrutura pendente, ordenadas por impacto na receita."
      width="wide"
      density="comfortable"
      actions={
        <Link href="/products?engineering_pending=1">
          <Button type="button" variant="outline" size="sm">
            <Layers className="h-4 w-4" />
            Ver no catálogo
          </Button>
        </Link>
      }
    >
      <Tabs
        value={sort}
        onValueChange={(v) => setSort(v === "oldest" ? "oldest" : "urgency")}
      >
        <TabsList>
          <TabsTrigger value="urgency">Por urgência</TabsTrigger>
          <TabsTrigger value="oldest">Mais antigas</TabsTrigger>
        </TabsList>
        <TabsContent value={sort} className="mt-4">
          <CronogramaPanel
            search={
              <CronogramaSearch
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Buscar produto, cliente, orçamento…"
              />
            }
            error={
              query.error ? (
                <CronogramaError
                  message={(query.error as Error).message}
                  onRetry={() => void query.refetch()}
                />
              ) : null
            }
          >
            {query.isLoading ? (
              <CronogramaLoading message="Carregando fila…" />
            ) : (
              <SortableTable
                density="cronograma"
                columns={columns}
                data={filtered}
                getRowKey={(r) => r.product_id}
                emptyMessage="Nenhuma demanda pendente."
                rowClassName="bg-amber-50/80 ring-1 ring-inset ring-amber-200/80"
                actionsColumn={{
                  label: "Ação",
                  width: "w-[8%]",
                  render: (r) => (
                    <Link href={`/products/${r.product_id}/structure`}>
                      <Button type="button" variant="ghost" size="sm">
                        Estrutura
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  ),
                }}
              />
            )}
          </CronogramaPanel>
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
