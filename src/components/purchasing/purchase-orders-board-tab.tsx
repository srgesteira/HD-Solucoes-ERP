"use client";

import { useQuery } from "@tanstack/react-query";
import type { PurchaseOrderBoardRow } from "@/modules/compras/lib/purchasing/purchase-orders-board";
import { PurchaseOrdersBoardTable } from "@/components/purchasing/purchase-orders-board-shared";
import { CronogramaLoading } from "@/shared/ui/cronograma-layout";

function boardQueryKey(bucket: "all" | "open" | "finished", search: string) {
  return ["purchasing-orders-board", bucket, search] as const;
}

async function fetchBoardOrders(
  bucket: "all" | "open" | "finished",
  search: string
): Promise<PurchaseOrderBoardRow[]> {
  const params = new URLSearchParams({ bucket });
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/purchasing/orders/board?${params.toString()}`, {
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

type PurchaseOrdersBoardTabProps = {
  bucket: "all" | "open" | "finished";
  search: string;
  canPurchasing?: boolean;
  editableDelivery?: boolean;
  onDeliveryChange?: (orderId: string, date: string | null) => Promise<void>;
  emptyMessage: string;
  loadingMessage: string;
};

export function PurchaseOrdersBoardTab({
  bucket,
  search,
  canPurchasing = false,
  editableDelivery = false,
  onDeliveryChange,
  emptyMessage,
  loadingMessage,
}: PurchaseOrdersBoardTabProps) {
  const q = useQuery({
    queryKey: boardQueryKey(bucket, search),
    queryFn: () => fetchBoardOrders(bucket, search),
  });

  if (q.isLoading) {
    return <CronogramaLoading message={loadingMessage} />;
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
      editableDelivery={editableDelivery}
      onDeliveryChange={onDeliveryChange}
      emptyMessage={emptyMessage}
      showActions
      canPurchasing={canPurchasing}
    />
  );
}
