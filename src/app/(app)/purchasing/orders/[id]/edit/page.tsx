"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";

/** Redireciona para a página única do pedido (visualização + edição inline). */
export default function EditPurchaseOrderRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  useEffect(() => {
    if (id) router.replace(`/purchasing/orders/${id}`);
    else router.replace("/purchasing/orders");
  }, [id, router]);

  return (
    <AppPage title="Pedido de compra" density="comfortable">
      <LoadingState label="A redireccionar…" />
    </AppPage>
  );
}
