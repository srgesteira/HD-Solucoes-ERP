"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PurchaseOrdersBoardTab } from "@/components/purchasing/purchase-orders-board-tab";

const queryKeyPrefix = ["purchasing-orders-board"] as const;

type OpenOrdersTabProps = {
  search?: string;
  canPurchasing?: boolean;
};

export function OpenOrdersTab({
  search = "",
  canPurchasing = false,
}: OpenOrdersTabProps) {
  const qc = useQueryClient();

  const patchDelivery = useMutation({
    mutationFn: async (args: { id: string; date: string | null }) => {
      const res = await fetch(`/api/purchasing/orders/${args.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_delivery_date: args.date }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string | null;
        conflict?: { order_number?: string | null; message?: string } | null;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar prazo");
      return json;
    },
    onSuccess: (json) => {
      void qc.invalidateQueries({ queryKey: queryKeyPrefix });
      toast.success("Prazo de entrega actualizado.");
      if (json.warning) toast.warning(json.warning, { duration: 10000 });
      else if (json.conflict?.message) {
        toast.warning(
          `Prazo alterado, mas pode atrasar a produção do pedido ${json.conflict.order_number ?? ""} – verifique no PCP.`,
          { duration: 10000 }
        );
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao guardar"),
  });

  return (
    <PurchaseOrdersBoardTab
      bucket="open"
      search={search}
      canPurchasing={canPurchasing}
      editableDelivery
      onDeliveryChange={async (id, date) => {
        await patchDelivery.mutateAsync({ id, date });
      }}
      emptyMessage="Nenhum pedido de compra em aberto."
      loadingMessage="A carregar pedidos em aberto…"
    />
  );
}
