"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import type {
  ProductionSupplyMaterialOverride,
  ProductionSupplyPendingRow,
} from "@/modules/almoxarifado/lib/production-supply";
import { SupplyBomReviewModal } from "@/components/almoxarifado/supply-bom-review-modal";
import { formatShortDate } from "@/shared/utils/date";

async function fetchPendingSupply(): Promise<ProductionSupplyPendingRow[]> {
  const res = await fetch("/api/inventory/production-supply", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionSupplyPendingRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar abastecimento");
  return json.data ?? [];
}

async function confirmSupply(
  orderItemId: string,
  materials: ProductionSupplyMaterialOverride[]
): Promise<void> {
  const res = await fetch("/api/inventory/production-supply", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_item_id: orderItemId, materials }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao abastecer");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const formatted = formatShortDate(iso);
  return formatted === "--" ? "—" : formatted;
}

function statusBadge(row: ProductionSupplyPendingRow) {
  if (row.apontamento_start_at) {
    return (
      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-900 ring-1 ring-amber-200">
        Em produção (sem baixa)
      </span>
    );
  }
  if (row.status === "in_progress") {
    return (
      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-900 ring-1 ring-blue-200">
        Em andamento
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
      Aguardando
    </span>
  );
}

export function SupplyTab() {
  const qc = useQueryClient();
  const [reviewOrderItemId, setReviewOrderItemId] = useState<string | null>(
    null
  );

  const listQ = useQuery({
    queryKey: ["production-supply-pending"],
    queryFn: fetchPendingSupply,
  });

  const supplyMut = useMutation({
    mutationFn: ({
      orderItemId,
      materials,
    }: {
      orderItemId: string;
      materials: ProductionSupplyMaterialOverride[];
    }) => confirmSupply(orderItemId, materials),
    onSuccess: async () => {
      toast.success("Abastecido — estoque actualizado.");
      setReviewOrderItemId(null);
      await qc.invalidateQueries({ queryKey: ["production-supply-pending"] });
      await qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      await qc.invalidateQueries({ queryKey: ["inventory-balances"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao abastecer");
    },
  });

  const columns = useMemo((): SortableTableColumn<ProductionSupplyPendingRow>[] => {
    return [
      {
        key: "order_number",
        label: "OP",
        type: "text",
        sortable: true,
        accessor: (row) => row.order_number,
        render: (row) => (
          <span className="font-medium tabular-nums">{row.order_number}</span>
        ),
      },
      {
        key: "product_code",
        label: "Produto",
        type: "text",
        sortable: true,
        accessor: (row) => row.product_code ?? row.product_name ?? "",
        render: (row) => (
          <div className="min-w-0">
            <div className="font-mono text-xs text-slate-700 truncate">
              {row.product_code ?? "—"}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {row.product_name ?? ""}
            </div>
          </div>
        ),
      },
      {
        key: "quantity",
        label: "Qtd",
        type: "number",
        sortable: true,
        accessor: (row) => row.quantity,
        align: "right",
        render: (row) => (
          <span className="tabular-nums">{row.quantity}</span>
        ),
      },
      {
        key: "material_count",
        label: "Materiais",
        type: "number",
        sortable: true,
        accessor: (row) => row.material_count,
        align: "right",
        render: (row) => (
          <span className="tabular-nums text-slate-600">{row.material_count}</span>
        ),
      },
      {
        key: "pcp_deadline",
        label: "Prazo PCP",
        type: "date",
        sortable: true,
        accessor: (row) => row.pcp_deadline ?? "",
        render: (row) => formatDate(row.pcp_deadline),
      },
      {
        key: "status",
        label: "Situação",
        type: "text",
        sortable: false,
        render: (row) => statusBadge(row),
      },
      {
        key: "actions",
        label: "",
        type: "text",
        sortable: false,
        align: "right",
        render: (row) => (
          <Button
            type="button"
            size="sm"
            onClick={() => setReviewOrderItemId(row.order_item_id)}
          >
            <PackageCheck className="h-4 w-4" />
            Abrir estrutura
          </Button>
        ),
      },
    ];
  }, []);

  const rows = listQ.data ?? [];
  const lateCount = rows.filter((r) => Boolean(r.apontamento_start_at)).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-brand-700" />
          <CardTitle className="text-lg">Abastecimento de produção</CardTitle>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={listQ.isFetching}
          onClick={() => void listQ.refetch()}
        >
          <RefreshCw
            className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`}
          />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {lateCount > 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {lateCount} item(ns) já iniciaram produção sem baixa de estoque.
            Abra a estrutura e confirme <strong>Abastecido</strong> para
            regularizar.
          </p>
        ) : null}

        {listQ.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-slate-600 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar fila de abastecimento…
          </div>
        ) : listQ.error ? (
          <p className="text-sm text-red-700 py-6 text-center">
            {listQ.error instanceof Error
              ? listQ.error.message
              : "Erro ao carregar"}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600 py-10 text-center">
            Nenhuma ordem de produção pendente de abastecimento.
          </p>
        ) : (
          <SortableTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.order_item_id}
            emptyMessage="Nenhuma ordem de produção pendente de abastecimento."
          />
        )}

        <p className="text-xs text-slate-500">
          Abra a estrutura da OP, troque componentes se necessário e só então
          confirme o abastecimento (baixa no extrato).{" "}
          <Link href="/logistics/warehouse?tab=operacoes" className="underline">
            Ver operações de estoque
          </Link>
        </p>
      </CardContent>

      <SupplyBomReviewModal
        orderItemId={reviewOrderItemId}
        confirming={supplyMut.isPending}
        onClose={() => {
          if (!supplyMut.isPending) setReviewOrderItemId(null);
        }}
        onConfirm={(orderItemId, materials) => {
          supplyMut.mutate({ orderItemId, materials });
        }}
      />
    </Card>
  );
}
