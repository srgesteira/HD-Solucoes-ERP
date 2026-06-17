"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/shared/ui/app-page";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/page-helpers";
import { fetchProductionLines } from "@/modules/producao/lib/production/production-lines-api";

export default function ProductionLinesIndexPage() {
  const router = useRouter();
  const linesQ = useQuery({
    queryKey: ["production-lines"],
    queryFn: fetchProductionLines,
  });

  useEffect(() => {
    if (linesQ.isLoading || linesQ.isError) return;
    const first = linesQ.data?.[0];
    if (first) {
      router.replace(`/production/lines/${first.id}`);
    }
  }, [linesQ.data, linesQ.isLoading, linesQ.isError, router]);

  return (
    <AppPage
      title="Linhas de produção"
      description="A redireccionar para a primeira linha activa."
      density="comfortable"
    >
      {linesQ.isLoading ? (
        <LoadingState label="A carregar linhas…" />
      ) : linesQ.isError ? (
        <ErrorState
          message={
            linesQ.error instanceof Error
              ? linesQ.error.message
              : "Erro ao carregar linhas"
          }
        />
      ) : !linesQ.data?.length ? (
        <EmptyState
          title="Nenhuma linha cadastrada"
          description="Cadastre linhas de produção em Configurações antes de usar o planeamento."
        />
      ) : (
        <LoadingState label="A redireccionar…" />
      )}
    </AppPage>
  );
}
