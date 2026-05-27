"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchProductionLines } from "@/lib/production/production-lines-api";

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

  if (linesQ.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-slate-600 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        A carregar linhas…
      </div>
    );
  }

  if (linesQ.isError) {
    return (
      <p className="text-sm text-red-600 py-8 text-center">
        {linesQ.error instanceof Error
          ? linesQ.error.message
          : "Erro ao carregar linhas"}
      </p>
    );
  }

  if (!linesQ.data?.length) {
    return (
      <p className="text-sm text-slate-600 py-8 text-center">
        Nenhuma linha de produção activa cadastrada.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 py-16 text-slate-600 justify-center">
      <Loader2 className="h-5 w-5 animate-spin" />
      A redireccionar…
    </div>
  );
}
