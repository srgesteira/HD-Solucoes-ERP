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
import { formatShortDate } from "@/shared/utils/date";
import type {
  FinancialMovementListItem,
  ListFinancialMovementsResult,
} from "@/modules/finance/lib/financial-movements-list";

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

function formatMovementDate(iso: string): string {
  const formatted = formatShortDate(iso.slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

function directionBadge(direction: "in" | "out") {
  if (direction === "in") {
    return (
      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
        Entrada
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-red-50 text-red-800 ring-1 ring-red-200">
      Saída
    </span>
  );
}

function amountCell(direction: "in" | "out", amount: number) {
  const formatted = fmtBrl(amount);
  if (direction === "in") {
    return (
      <span className="tabular-nums font-medium text-emerald-700">
        +{formatted}
      </span>
    );
  }
  return (
    <span className="tabular-nums font-medium text-red-700">−{formatted}</span>
  );
}

function originCell(origin: FinancialMovementListItem["origin"]) {
  if (origin.kind === "purchase_order") {
    return (
      <Link
        href={`/purchasing/orders/${origin.purchase_order_id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-900 hover:underline"
      >
        {origin.label}
      </Link>
    );
  }
  if (origin.kind === "sales_order") {
    return (
      <Link
        href={`/sales/orders/${origin.sales_order_id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-900 hover:underline"
      >
        {origin.label}
      </Link>
    );
  }
  return <span className="text-sm text-slate-700">{origin.label}</span>;
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
        key: "movement_date",
        label: "Data",
        type: "text",
        width: "w-[11%]",
        accessor: (row) => row.movement_date,
        sortable: false,
        render: (row) => (
          <span className="text-sm text-slate-700 whitespace-nowrap">
            {formatMovementDate(row.movement_date)}
          </span>
        ),
      },
      {
        key: "description",
        label: "Descrição",
        type: "text",
        width: "w-[28%]",
        accessor: (row) => row.description,
        sortable: false,
        render: (row) => (
          <span className="text-sm text-slate-800">{row.description}</span>
        ),
      },
      {
        key: "direction",
        label: "Tipo",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => row.direction,
        sortable: false,
        render: (row) => directionBadge(row.direction),
      },
      {
        key: "amount",
        label: "Valor",
        type: "number",
        width: "w-[13%]",
        align: "right",
        accessor: (row) => row.amount,
        sortable: false,
        truncate: false,
        render: (row) => amountCell(row.direction, row.amount),
      },
      {
        key: "origin",
        label: "Origem",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => row.origin.label,
        sortable: false,
        truncate: false,
        render: (row) => originCell(row.origin),
      },
      {
        key: "cumulative_balance",
        label: "Saldo acumulado",
        type: "number",
        width: "w-[16%]",
        align: "right",
        accessor: (row) => row.cumulative_balance,
        sortable: false,
        truncate: false,
        render: (row) => (
          <span
            className={cn(
              "tabular-nums text-sm font-medium",
              row.cumulative_balance < 0 ? "text-red-700" : "text-slate-800"
            )}
          >
            {fmtBrl(row.cumulative_balance)}
          </span>
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
