"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";

/** Composição unificada no separador da página de edição. */
export default function ProductStructureRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id;
  const productId =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  useEffect(() => {
    if (productId) {
      router.replace(`/products/${productId}/edit?tab=composition`);
    } else {
      router.replace("/products");
    }
  }, [productId, router]);

  return (
    <AppPage title="Estrutura do produto" density="comfortable">
      <LoadingState label="A redireccionar para a edição do produto…" />
    </AppPage>
  );
}
