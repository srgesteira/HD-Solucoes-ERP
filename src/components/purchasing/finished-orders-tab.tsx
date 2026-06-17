"use client";

import { PurchaseOrdersBoardTab } from "@/components/purchasing/purchase-orders-board-tab";

type FinishedOrdersTabProps = {
  search?: string;
  canPurchasing?: boolean;
};

export function FinishedOrdersTab({
  search = "",
  canPurchasing = false,
}: FinishedOrdersTabProps) {
  return (
    <PurchaseOrdersBoardTab
      bucket="finished"
      search={search}
      canPurchasing={canPurchasing}
      editableDelivery={false}
      emptyMessage="Nenhum pedido recebido no histórico."
      loadingMessage="A carregar histórico…"
    />
  );
}
