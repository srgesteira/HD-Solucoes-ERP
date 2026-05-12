"use client";

import { useQuery } from "@tanstack/react-query";
import type { WorkArea } from "@/lib/types/kanban";

export const workAreasQueryKey = ["work-areas"] as const;

async function fetchWorkAreas(): Promise<WorkArea[]> {
  const res = await fetch("/api/work-areas", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao carregar áreas");
  }
  const data = (await res.json()) as { areas: WorkArea[] };
  return data.areas ?? [];
}

export function useWorkAreas() {
  return useQuery({
    queryKey: workAreasQueryKey,
    queryFn: fetchWorkAreas,
    staleTime: 120_000,
  });
}
