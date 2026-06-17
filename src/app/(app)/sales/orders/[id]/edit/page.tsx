"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppPage } from "@/shared/ui/app-page";
import { EmptyState, LoadingState } from "@/shared/ui/page-helpers";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { SalesOrderForm } from "@/components/sales/sales-order-form";

export default function SalesOrderEditPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const orderId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : null;

  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEdit = !meLoading && (isAdmin || can("sales"));

  useEffect(() => {
    if (!canEdit && !meLoading) {
      toast.error("Sem permissão para editar pedidos de venda.");
      router.replace(
        orderId ? `/sales/orders/${orderId}` : "/sales/orders"
      );
    }
  }, [canEdit, meLoading, orderId, router]);

  if (!orderId) {
    return (
      <AppPage
        title="Editar pedido de venda"
        backHref="/sales/orders"
        width="narrow"
      >
        <EmptyState
          title="Pedido inválido"
          description="Não foi possível identificar o pedido."
        />
      </AppPage>
    );
  }

  if (meLoading || !canEdit) {
    return <LoadingState label="A validar permissões…" />;
  }

  return (
    <AppPage
      title="Editar pedido de venda"
      backHref={`/sales/orders/${orderId}`}
      backLabel="Voltar ao pedido"
      width="narrow"
      density="comfortable"
    >
      <SalesOrderForm
        mode="edit"
        orderId={orderId}
        cancelHref={`/sales/orders/${orderId}`}
        isAdmin={isAdmin}
        onSaved={(id) => router.push(`/sales/orders/${id}`)}
      />
    </AppPage>
  );
}
