"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { PurchaseOrderBoardRow } from "@/lib/purchasing/purchase-orders-board";
import { PurchaseOrdersBoardTable } from "@/components/purchasing/purchase-orders-board-shared";

const queryKey = ["purchasing-orders-board", "finished"] as const;

async function fetchFinishedOrders(): Promise<PurchaseOrderBoardRow[]> {
  const res = await fetch("/api/purchasing/orders/board?bucket=finished", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    rows?: PurchaseOrderBoardRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar pedidos");
  return json.rows ?? [];
}

type FinishedOrdersTabProps = {
  canPurchasing?: boolean;
};

export function FinishedOrdersTab({ canPurchasing = false }: FinishedOrdersTabProps) {
  const q = useQuery({ queryKey, queryFn: fetchFinishedOrders });

  if (q.isLoading) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar histórico…
      </p>
    );
  }

  if (q.error) {
    return (
      <p className="text-sm text-red-700 py-8 text-center">
        {q.error instanceof Error ? q.error.message : "Erro"}
      </p>
    );
  }

  return (
    <PurchaseOrdersBoardTable
      rows={q.data ?? []}
      editableDelivery={false}
      emptyMessage="Nenhum pedido recebido no histórico."
      showActions
      canPurchasing={canPurchasing}
    />
  );
}
