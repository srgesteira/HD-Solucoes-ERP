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
  const raw = await res.text();
  if (!res.ok) {
    let apiMessage: string | undefined;
    try {
      const j = JSON.parse(raw) as { error?: string };
      apiMessage = j.error;
    } catch {
      /* corpo não-JSON (ex.: página HTML da Vercel) */
    }
    const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 280);
    throw new Error(
      apiMessage ??
        (snippet
          ? `Erro ${res.status}: ${snippet}`
          : `Erro ${res.status} ao carregar projetos`)
    );
  }
  return JSON.parse(raw) as EpicsPipelineResponse;
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
