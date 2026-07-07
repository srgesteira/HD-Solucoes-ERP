"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  MenuAlertDetail,
  MenuAlertEntry,
  MenuAlertsMap,
  MenuAlertsPayload,
} from "@/modules/core/lib/navigation/menu-alerts";

export const menuAlertsQueryKey = ["menu-alerts"] as const;

async function fetchMenuAlerts(): Promise<MenuAlertsPayload> {
  const res = await fetch("/api/menu-alerts", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    alerts?: MenuAlertsMap;
    details?: MenuAlertDetail[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar alertas do menu");
  }
  return {
    alerts: json.alerts ?? {},
    details: json.details ?? [],
  };
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
  const direct = alerts[href];
  if (direct) return direct;

  if (href === "/finance/contas") {
    const parts = [
      alerts["/finance/contas?tab=pagar"],
      alerts["/finance/contas?tab=receber"],
    ].filter(Boolean) as MenuAlertEntry[];
    if (!parts.length) return undefined;
    return parts.reduce<MenuAlertEntry>(
      (acc, entry) => ({
        count: acc.count + entry.count,
        level:
          entry.level === "urgent" || acc.level === "urgent"
            ? "urgent"
            : entry.level === "attention" || acc.level === "attention"
              ? "attention"
              : "info",
      }),
      { count: 0, level: "info" }
    );
  }

  return undefined;
}
