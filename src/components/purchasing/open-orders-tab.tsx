"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PurchaseOrderBoardRow } from "@/lib/purchasing/purchase-orders-board";
import { PurchaseOrdersBoardTable } from "@/components/purchasing/purchase-orders-board-shared";
const queryKey = ["purchasing-orders-board", "open"] as const;

async function fetchOpenOrders(): Promise<PurchaseOrderBoardRow[]> {
  const res = await fetch("/api/purchasing/orders/board?bucket=open", {
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

type OpenOrdersTabProps = {
  canPurchasing?: boolean;
};

export function OpenOrdersTab({ canPurchasing = false }: OpenOrdersTabProps) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: fetchOpenOrders });

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
      void qc.invalidateQueries({ queryKey });
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

  if (q.isLoading) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar pedidos em aberto…
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
      editableDelivery
      onDeliveryChange={async (id, date) => {
        await patchDelivery.mutateAsync({ id, date });
      }}
      emptyMessage="Nenhum pedido de compra em aberto."
      showActions
      canPurchasing={canPurchasing}
    />
  );
}
