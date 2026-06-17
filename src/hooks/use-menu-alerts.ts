"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  MenuAlertEntry,
  MenuAlertsMap,
} from "@/modules/core/lib/navigation/menu-alerts";

export const menuAlertsQueryKey = ["menu-alerts"] as const;

async function fetchMenuAlerts(): Promise<MenuAlertsMap> {
  const res = await fetch("/api/menu-alerts", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    alerts?: MenuAlertsMap;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar alertas do menu");
  }
  return json.alerts ?? {};
}

export function useMenuAlerts() {
  return useQuery({
    queryKey: menuAlertsQueryKey,
    queryFn: fetchMenuAlerts,
    refetchInterval: 180_000,
    staleTime: 120_000,
    retry: 1,
  });
}

export function alertCountForHref(
  alerts: MenuAlertsMap | undefined,
  href: string
): number {
  if (!alerts || !href) return 0;
  return alerts[href]?.count ?? 0;
}

export function alertEntryForHref(
  alerts: MenuAlertsMap | undefined,
  href: string
): MenuAlertEntry | undefined {
  if (!alerts || !href) return undefined;
  return alerts[href];
}
