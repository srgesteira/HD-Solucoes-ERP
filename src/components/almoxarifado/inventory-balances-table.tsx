"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
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

async function fetchInventoryBalances(): Promise<InventoryBalanceRow[]> {
  const res = await fetch("/api/inventory", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: InventoryBalanceRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar estoque");
  return json.data ?? [];
}

type Props = {
  canAdjust?: boolean;
};

export function InventoryBalancesTable({ canAdjust = false }: Props) {
  const [rows, setRows] = useState<InventoryBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchInventoryBalances();
        if (!cancelled) setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar estoque");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5" />
          Saldos em estoque
        </CardTitle>
        {canAdjust ? (
          <Link href="/inventory/adjust">
            <Button type="button" size="sm">
              Ajustar estoque
            </Button>
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 && !loading ? (
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
            isLoading={loading}
            emptyMessage="Sem linhas de estoque."
          />
        )}
      </CardContent>
    </Card>
  );
}
