"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";

export type InventoryBalanceRow = {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  reserved_quantity: number;
  product?: { name?: string | null; technical_code?: string | null } | null;
};

type InventoryListResult = {
  data: InventoryBalanceRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

const DEFAULT_PAGE_SIZE = 50;

async function fetchInventoryBalances(
  page: number,
  pageSize: number
): Promise<InventoryListResult> {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  sp.set("page_size", String(pageSize));

  const res = await fetch(`/api/inventory?${sp.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as InventoryListResult & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar estoque");
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? {
      page,
      page_size: pageSize,
      total: 0,
      total_pages: 0,
    },
  };
}

type Props = {
  canAdjust?: boolean;
};

export function InventoryBalancesTable({ canAdjust = false }: Props) {
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  const queryKey = ["inventory-balances", page, pageSize] as const;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchInventoryBalances(page, pageSize),
    retry: 1,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 0;

  const tableColumns = useMemo((): SortableTableColumn<InventoryBalanceRow>[] => {
    return [
      {
        key: "product",
        label: "Produto",
        type: "text",
        width: "w-[50%]",
        accessor: (row) => {
          const p = Array.isArray(row.product) ? row.product[0] : row.product;
          return p?.technical_code && p?.name
            ? `${p.technical_code} — ${p.name}`
            : p?.name ?? row.product_id;
        },
        render: (row) => {
          const p = Array.isArray(row.product) ? row.product[0] : row.product;
          const label =
            p?.technical_code && p?.name
              ? `${p.technical_code} — ${p.name}`
              : p?.name ?? row.product_id.slice(0, 8);
          return <span className="text-slate-800">{label}</span>;
        },
      },
      {
        key: "quantity_on_hand",
        label: "Em mão",
        type: "number",
        width: "w-[25%]",
        align: "right",
        accessor: (row) => row.quantity_on_hand,
        truncate: false,
        render: (row) => (
          <span className="tabular-nums">{Number(row.quantity_on_hand)}</span>
        ),
      },
      {
        key: "reserved_quantity",
        label: "Reservado",
        type: "number",
        width: "w-[25%]",
        align: "right",
        accessor: (row) => row.reserved_quantity,
        truncate: false,
        render: (row) => (
          <span className="tabular-nums">{Number(row.reserved_quantity)}</span>
        ),
      },
    ];
  }, []);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5" />
          Saldos em estoque
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="sr-only">Atualizar</span>
          </Button>
          {canAdjust ? (
            <Link href="/inventory/adjust">
              <Button type="button" size="sm">
                Ajustar estoque
              </Button>
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-red-700 py-2">
            {error instanceof Error ? error.message : "Erro ao carregar."}
          </p>
        ) : null}

        {rows.length === 0 && !isLoading && !error ? (
          <p className="text-sm text-slate-500 py-6">
            Sem linhas de estoque. Os administradores podem registar saldos via
            API{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              POST /api/inventory
            </code>
            .
          </p>
        ) : (
          <SortableTable
            columns={tableColumns}
            data={rows}
            getRowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Sem linhas de estoque."
          />
        )}

        {total > 0 ? (
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
            <p className="text-sm text-slate-500">
              Mostrando {rangeStart}–{rangeEnd} de {total} produtos
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm text-slate-600 tabular-nums">
                Página {page}
                {totalPages > 0 ? ` / ${totalPages}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  isFetching ||
                  (totalPages > 0 ? page >= totalPages : rows.length < pageSize)
                }
                onClick={() => setPage((p) => p + 1)}
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
