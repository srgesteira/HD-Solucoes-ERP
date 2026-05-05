"use client";

import { useQuery } from "@tanstack/react-query";
import type { PipelineResponse } from "@/lib/types/pipeline";

export const TASKS_PIPELINE_KEY = ["tasks-pipeline"] as const;

async function fetchPipeline(): Promise<PipelineResponse> {
  const res = await fetch("/api/tasks/pipeline", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao carregar painel de execução");
  }
  return res.json() as Promise<PipelineResponse>;
}

export function useTasksPipeline(enabled: boolean) {
  return useQuery({
    queryKey: TASKS_PIPELINE_KEY,
    queryFn: fetchPipeline,
    enabled,
    staleTime: 30_000,
  });
}
