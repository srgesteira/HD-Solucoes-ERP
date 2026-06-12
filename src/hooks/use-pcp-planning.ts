"use client";

import { useQuery } from "@tanstack/react-query";
import type { PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";

export const pcpPlanningQueryKey = ["pcp-planning"] as const;

/** Cache partilhado entre abas/views do PCP — evita refetch triplicado. */
export const PCP_PLANNING_STALE_TIME_MS = 60_000;
export const PCP_PLANNING_GC_TIME_MS = 5 * 60_000;

export async function fetchPcpPlanning(): Promise<{ orders: PcpPlanningOrder[] }> {
  const res = await fetch("/api/pcp/planning", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    orders?: PcpPlanningOrder[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar planeamento");
  return { orders: Array.isArray(json.orders) ? json.orders : [] };
}

export function usePcpPlanningQuery(enabled = true) {
  return useQuery({
    queryKey: pcpPlanningQueryKey,
    queryFn: fetchPcpPlanning,
    enabled,
    staleTime: PCP_PLANNING_STALE_TIME_MS,
    gcTime: PCP_PLANNING_GC_TIME_MS,
  });
}
