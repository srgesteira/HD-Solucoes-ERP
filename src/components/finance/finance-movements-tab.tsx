"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { BrDateInput } from "@/shared/ui/br-date-input";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import {
  CronogramaPagination,
} from "@/shared/ui/cronograma-layout";
import { cn } from "@/shared/utils/cn";
import type {
  FinancialMovementListItem,
  ListFinancialMovementsResult,
} from "@/modules/finance/lib/financial-movements-list";
import { formatShortFinanceDescription } from "@/modules/finance/lib/finance-line-format";
import {
  FinanceAmountCell,
  FinanceBalanceCell,
  FinanceDateCell,
  FinanceDirectionBadge,
  FinanceTextCell,
  FINANCE_TABLE_WIDTHS,
} from "@/components/finance/finance-table-ui";

type DirectionFilter = "all" | "in" | "out";

type Filters = {
  page: number;
  limit: number;
  direction: DirectionFilter;
  from: string;
  to: string;
};

const DEFAULT_LIMIT = 50;

const selectClassName = cn(
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
);

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

async function fetchMovements(
  filters: Filters
): Promise<ListFinancialMovementsResult> {
  const sp = new URLSearchParams();
  sp.set("page", String(filters.page));
  sp.set("limit", String(filters.limit));
  if (filters.direction !== "all") {
    sp.set("direction", filters.direction);
  }
  if (filters.from.trim()) sp.set("from", filters.from.trim());
  if (filters.to.trim()) sp.set("to", filters.to.trim());

  const res = await fetch(`/api/finance/movements?${sp.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ListFinancialMovementsResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar movimentações.");
  }
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? {
      page: filters.page,
      limit: filters.limit,
      total: 0,
    },
    summary: json.summary ?? { opening_balance: 0, closing_balance: 0 },
  };
}

export function FinanceMovementsTab() {
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    limit: DEFAULT_LIMIT,
    direction: "all",
    from: "",
    to: "",
  });

  const queryKey = [
    "finance-movements",
    filters.page,
    filters.limit,
    filters.direction,
    filters.from,
    filters.to,
  ] as const;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchMovements(filters),
  });

  const rows = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  const rangeDescription = useMemo(() => {
    if (!total) return "0 de 0";
    const start = (filters.page - 1) * filters.limit + 1;
    const end = Math.min(filters.page * filters.limit, total);
    return `${start}–${end} de ${total}`;
  }, [filters.page, filters.limit, total]);

  const columns = useMemo((): SortableTableColumn<FinancialMovementListItem>[] => {
    return [
      {
        key: "short_description",
        label: "Descrição",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.description,
        accessor: (row) => row.short_description,
        sortable: false,
        render: (row) => {
          const label =
            row.short_description ||
            formatShortFinanceDescription(row.description);
          if (row.origin.kind === "purchase_order") {
            return (
              <Link
                href={`/purchasing/orders/${row.origin.purchase_order_id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-900 hover:underline"
              >
                {label}
              </Link>
            );
          }
          if (row.origin.kind === "sales_order") {
            return (
              <Link
                href={`/sales/orders/${row.origin.sales_order_id}`}
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
        key: "entity_name",
        label: "Entidade",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.entity,
        accessor: (row) => row.entity_name ?? "",
        sortable: false,
        render: (row) => (
          <FinanceTextCell className="text-slate-700">
            {row.entity_name ?? "—"}
          </FinanceTextCell>
        ),
      },
      {
        key: "direction",
        label: "Tipo",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.type,
        accessor: (row) => row.direction,
        sortable: false,
        render: (row) => <FinanceDirectionBadge direction={row.direction} />,
      },
      {
        key: "movement_date",
        label: "Data",
        type: "text",
        width: FINANCE_TABLE_WIDTHS.date,
        accessor: (row) => row.movement_date,
        sortable: false,
        render: (row) => <FinanceDateCell iso={row.movement_date} />,
      },
      {
        key: "amount",
        label: "Valor",
        type: "number",
        width: FINANCE_TABLE_WIDTHS.amount,
        align: "right",
        accessor: (row) => row.amount,
        sortable: false,
        truncate: false,
        render: (row) => (
          <FinanceAmountCell direction={row.direction} amount={row.amount} />
        ),
      },
      {
        key: "cumulative_balance",
        label: "Saldo acumulado",
        type: "number",
        width: FINANCE_TABLE_WIDTHS.balance,
        align: "right",
        accessor: (row) => row.cumulative_balance,
        sortable: false,
        truncate: false,
        render: (row) => (
          <FinanceBalanceCell amount={row.cumulative_balance} />
        ),
      },
    ];
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">Movimentação financeira</CardTitle>
          {data?.summary ? (
            <p className="text-xs text-slate-500 mt-1">
              Saldo inicial configurado:{" "}
              <span className="font-medium text-slate-700">
                {fmtBrl(data.summary.opening_balance)}
              </span>
              {" · "}
              Saldo após movimentos filtrados:{" "}
              <span className="font-medium text-slate-700">
                {fmtBrl(data.summary.closing_balance)}
              </span>
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw
            className={cn("h-4 w-4", isFetching && "animate-spin")}
            aria-hidden
          />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex flex-col gap-1 min-w-[10rem]">
            <label
              htmlFor="finance-movement-direction"
              className="text-xs font-medium text-slate-600"
            >
              Tipo
            </label>
            <select
              id="finance-movement-direction"
              className={selectClassName}
              value={filters.direction}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  direction: e.target.value as DirectionFilter,
                  page: 1,
                })
              }
            >
              <option value="all">Todos</option>
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[10rem]">
            <label htmlFor="finance-from-date" className="text-xs font-medium text-slate-600">
              De
            </label>
            <BrDateInput
              id="finance-from-date"
              value={filters.from || null}
              onChange={(iso) =>
                setFilters({ ...filters, from: iso ?? "", page: 1 })
              }
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[10rem]">
            <label htmlFor="finance-to-date" className="text-xs font-medium text-slate-600">
              Até
            </label>
            <BrDateInput
              id="finance-to-date"
              value={filters.to || null}
              onChange={(iso) =>
                setFilters({ ...filters, to: iso ?? "", page: 1 })
              }
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-700 py-4">
            {error instanceof Error ? error.message : "Erro ao carregar."}
          </p>
        ) : null}

        <SortableTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          density="cronograma"
          isLoading={isLoading}
          emptyMessage="Nenhuma movimentação registrada."
        />

        {isLoading && !rows.length ? (
          <div className="flex justify-center py-4 text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar…
          </div>
        ) : null}

        {total > 0 ? (
          <CronogramaPagination
            page={filters.page}
            totalPages={totalPages}
            rangeDescription={rangeDescription}
            itemCount={rows.length}
            onPageChange={(page) => setFilters({ ...filters, page })}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
