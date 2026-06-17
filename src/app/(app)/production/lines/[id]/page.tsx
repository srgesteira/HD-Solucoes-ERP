"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PcpLinesPlanningView } from "@/components/pcp/pcp-lines-planning-view";
import { ProductionLineCleanroomPanel } from "@/components/producao/production-line-cleanroom-panel";
import { fetchProductionLine } from "@/modules/producao/lib/production/production-lines-api";

export default function ProductionLineSchedulePage() {
  const params = useParams();
  const lineId = typeof params.id === "string" ? params.id : "";

  const lineQ = useQuery({
    queryKey: ["production-line", lineId],
    queryFn: () => fetchProductionLine(lineId),
    enabled: Boolean(lineId),
  });

  if (!lineId) {
    return (
      <p className="text-sm text-red-600 py-8 text-center">
        Identificador da linha inválido.
      </p>
    );
  }

  if (lineQ.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-slate-600 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        A carregar linha…
      </div>
    );
  }

  if (lineQ.error) {
    return (
      <p className="text-sm text-red-600 py-8 text-center">
        {lineQ.error instanceof Error ? lineQ.error.message : "Erro"}
      </p>
    );
  }

  const line = lineQ.data;
  const lineLabel = line ? `${line.code} - ${line.name}` : "";

  return (
    <div className="space-y-4">
      {line ? <ProductionLineCleanroomPanel line={line} /> : null}
      <PcpLinesPlanningView
        fixedLineId={lineId}
        lineLabel={lineLabel}
      />
    </div>
  );
}
