"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppPage } from "@/shared/ui/app-page";
import { LoadingState } from "@/shared/ui/page-helpers";

/** Redireciona para a página única do orçamento (edição + acções no mesmo ecrã). */
export default function QuoteEditRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (id) router.replace(`/sales/quotes/${id}`);
  }, [id, router]);

  return (
    <AppPage title="Orçamento" density="comfortable">
      <LoadingState label="A redireccionar…" />
    </AppPage>
  );
}
