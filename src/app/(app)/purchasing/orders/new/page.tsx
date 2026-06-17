"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canCreate = !meLoading && (isAdmin || can("purchasing"));

  useEffect(() => {
    if (!canCreate && !meLoading) {
      toast.error("Sem permissão para criar pedidos de compra.");
      router.replace("/purchasing/orders");
    }
  }, [canCreate, meLoading, router]);

  if (meLoading || !canCreate) {
    return <LoadingState label="A validar permissões…" />;
  }

  return (
    <AppPage
      title="Novo pedido de compra"
      backHref="/purchasing/orders"
      width="wide"
      density="comfortable"
    >
      <PurchaseOrderForm
        mode="create"
        cancelHref="/purchasing/orders"
        onSaved={(id) => router.push(`/purchasing/orders/${id}`)}
      />
    </AppPage>
  );
}
