"use client";

import { PurchaseOrdersBoardTab } from "@/components/purchasing/purchase-orders-board-tab";

type AllOrdersTabProps = {
  search?: string;
  canPurchasing?: boolean;
};

export function AllOrdersTab({
  search = "",
  canPurchasing = false,
}: AllOrdersTabProps) {
  return (
    <PurchaseOrdersBoardTab
      bucket="all"
      search={search}
      canPurchasing={canPurchasing}
      editableDelivery={false}
      emptyMessage="Nenhum pedido de compra encontrado."
      loadingMessage="A carregar todos os pedidos…"
    />
  );
}
