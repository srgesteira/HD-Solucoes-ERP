"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { cn } from "@/shared/utils/cn";
import type {
  InventoryMovementListItem,
  ListInventoryMovementsResult,
} from "@/modules/almoxarifado/lib/inventory-movements-list";

type MovementTypeFilter = "all" | "in" | "out" | "adjustment";

type Filters = {
  page: number;
  limit: number;
  movementType: MovementTypeFilter;
  from: string;
  to: string;
  productSearch: string;
};

const DEFAULT_LIMIT = 50;

const selectClassName = cn(
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
);

const dateInputClassName = cn(
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
);

function formatMovementDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function productLabel(row: InventoryMovementListItem): string {
  const p = row.product;
  if (!p) return "—";
  if (p.technical_code && p.name) return `${p.technical_code} — ${p.name}`;
  return p.name ?? p.technical_code ?? "—";
}

function movementTypeBadge(type: string) {
  if (type === "in") {
    return (
      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
        Entrada
      </span>
    );
  }
  if (type === "out") {
    return (
      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-red-50 text-red-800 ring-1 ring-red-200">
        Saída
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
      Ajuste
    </span>
  );
}

function quantityCell(type: string, quantity: number) {
  const raw = Number(quantity);
  const n = Number.isFinite(raw) ? Math.abs(raw) : NaN;
  const formatted = Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
    : "—";

  if (type === "in") {
    return (
      <span className="tabular-nums font-medium text-emerald-700">
        +{formatted}
      </span>
    );
  }
  if (type === "out") {
    return (
      <span className="tabular-nums font-medium text-red-700">−{formatted}</span>
    );
  }
  return <span className="tabular-nums text-slate-700">{formatted}</span>;
}

function originCell(origin: InventoryMovementListItem["origin"]) {
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
  return <span className="text-sm text-slate-700">{origin.label}</span>;
}

async function fetchMovements(
  filters: Filters
): Promise<ListInventoryMovementsResult> {
  const sp = new URLSearchParams();
  sp.set("page", String(filters.page));
  sp.set("limit", String(filters.limit));
  if (filters.movementType !== "all") {
    sp.set("movement_type", filters.movementType);
  }
  if (filters.from.trim()) sp.set("from", filters.from.trim());
  if (filters.to.trim()) sp.set("to", filters.to.trim());

  const res = await fetch(`/api/inventory/movements?${sp.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ListInventoryMovementsResult & {
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
  };
}

export function StockOperationsTab() {
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    limit: DEFAULT_LIMIT,
    movementType: "all",
    from: "",
    to: "",
    productSearch: "",
  });

  const queryKey = [
    "inventory-movements",
    filters.page,
    filters.limit,
    filters.movementType,
    filters.from,
    filters.to,
  ] as const;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchMovements(filters),
    retry: 1,
  });

  const filteredRows = useMemo(() => {
    const rows = data?.data ?? [];
    const q = filters.productSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      productLabel(row).toLowerCase().includes(q)
    );
  }, [data?.data, filters.productSearch]);

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / filters.limit))
    : 1;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    if (total === 0) return "0 registos";
    const start = (filters.page - 1) * filters.limit + 1;
    const end = Math.min(filters.page * filters.limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination, filters.page, filters.limit]);

  const columns = useMemo((): SortableTableColumn<InventoryMovementListItem>[] => {
    return [
      {
        key: "created_at",
        label: "Data",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.created_at,
        sortable: false,
        render: (row) => (
          <span className="text-sm text-slate-700 whitespace-nowrap">
            {formatMovementDateTime(row.created_at)}
          </span>
        ),
      },
      {
        key: "product",
        label: "Produto",
        type: "text",
        width: "w-[28%]",
        accessor: (row) => productLabel(row),
        render: (row) => (
          <span className="text-sm text-slate-800">{productLabel(row)}</span>
        ),
      },
      {
        key: "movement_type",
        label: "Tipo",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => row.movement_type,
        sortable: false,
        render: (row) => movementTypeBadge(row.movement_type),
      },
      {
        key: "quantity",
        label: "Quantidade",
        type: "number",
        width: "w-[12%]",
        align: "right",
        accessor: (row) => row.quantity,
        sortable: false,
        truncate: false,
        render: (row) => quantityCell(row.movement_type, row.quantity),
      },
      {
        key: "origin",
        label: "Origem",
        type: "text",
        width: "w-[36%]",
        accessor: (row) => row.origin.label,
        sortable: false,
        truncate: false,
        render: (row) => originCell(row.origin),
      },
    ];
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-lg">Operações de estoque</CardTitle>
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
              htmlFor="movement-type-filter"
              className="text-xs font-medium text-slate-600"
            >
              Tipo
            </label>
            <select
              id="movement-type-filter"
              className={selectClassName}
              value={filters.movementType}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  movementType: e.target.value as MovementTypeFilter,
                  page: 1,
                })
              }
            >
              <option value="all">Todos</option>
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
              <option value="adjustment">Ajuste</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[10rem]">
            <label htmlFor="from-date" className="text-xs font-medium text-slate-600">
              De
            </label>
            <input
              id="from-date"
              type="date"
              className={dateInputClassName}
              value={filters.from}
              onChange={(e) =>
                setFilters({ ...filters, from: e.target.value, page: 1 })
              }
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[10rem]">
            <label htmlFor="to-date" className="text-xs font-medium text-slate-600">
              Até
            </label>
            <input
              id="to-date"
              type="date"
              className={dateInputClassName}
              value={filters.to}
              onChange={(e) =>
                setFilters({ ...filters, to: e.target.value, page: 1 })
              }
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <label
              htmlFor="product-search"
              className="text-xs font-medium text-slate-600"
            >
              Produto (página actual)
            </label>
            <input
              id="product-search"
              type="search"
              placeholder="Código ou nome…"
              className={dateInputClassName}
              value={filters.productSearch}
              onChange={(e) =>
                setFilters({ ...filters, productSearch: e.target.value })
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
          data={filteredRows}
          getRowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="Nenhuma movimentação registrada."
        />

        {data?.pagination?.total !== undefined && data.pagination.total > 0 ? (
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
            <p className="text-sm text-slate-500">
              Movimentos nesta página: {filteredRows.length}. Intervalo total:{" "}
              <span className="font-medium text-slate-700">{rangeDescription}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filters.page <= 1 || isFetching}
                onClick={() =>
                  setFilters({
                    ...filters,
                    page: Math.max(1, filters.page - 1),
                  })
                }
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm tabular-nums px-2 text-slate-600">
                Página {filters.page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filters.page >= totalPages || isFetching}
                onClick={() =>
                  setFilters({
                    ...filters,
                    page: Math.min(totalPages, filters.page + 1),
                  })
                }
                aria-label="Página seguinte"
              >
                Seguinte
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
