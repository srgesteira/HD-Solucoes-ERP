"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EpicsPipelineResponse } from "@/lib/types/epic-pipeline";

export const EPICS_PIPELINE_KEY = ["epics-pipeline"] as const;

async function fetchEpicsPipeline(): Promise<EpicsPipelineResponse> {
  const res = await fetch("/api/epics/pipeline", {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao carregar projetos");
  }
  return res.json() as Promise<EpicsPipelineResponse>;
}

export function useEpicsPipeline(enabled: boolean) {
  return useQuery({
    queryKey: EPICS_PIPELINE_KEY,
    queryFn: fetchEpicsPipeline,
    enabled,
    staleTime: 20_000,
  });
}

export function useInvalidateEpicsPipeline() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: EPICS_PIPELINE_KEY });
}
