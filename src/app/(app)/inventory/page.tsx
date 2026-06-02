"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

type InvRow = {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  reserved_quantity: number;
  product?: { name?: string | null; technical_code?: string | null } | null;
};

async function fetchInventory(): Promise<InvRow[]> {
  const res = await fetch("/api/inventory", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: InvRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar estoque");
  return json.data ?? [];
}

export default function InventoryPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { can, isLoading: permLoading } = usePermissions();
  const [rows, setRows] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);

  const canView =
    me?.role === "admin" || (!permLoading && can("inventory"));
  const canAdjust = me?.role === "admin";

  useEffect(() => {
    if (meLoading || permLoading) return;
    if (!me) return;
    if (!canView) {
      toast.error("Sem permissão para consultar estoque.");
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchInventory();
        if (!cancelled) setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, meLoading, permLoading, canView, router]);

  if (!meLoading && !permLoading && !canView) {
    return null;
  }

  const tableColumns = useMemo((): SortableTableColumn<InvRow>[] => {
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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/products">
          <Button type="button" variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Produtos
          </Button>
        </Link>
        {canAdjust ? (
          <Link href="/inventory/adjust">
            <Button type="button" size="sm">
              Ajustar estoque
            </Button>
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" />
            Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !loading ? (
            <p className="text-sm text-slate-500 py-6">
              Sem linhas de estoque. Os administradores podem registar saldos
              via API{" "}
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
    </div>
  );
}
