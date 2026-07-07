"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  getPendingDetailsForPath,
  type MenuAlertDetail,
  type MenuAlertEntry,
  type MenuAlertLevel,
} from "@/modules/core/lib/navigation/menu-alerts";
import { useMenuAlerts } from "@/hooks/use-menu-alerts";

export function badgeClassForLevel(level: MenuAlertLevel): string {
  switch (level) {
    case "urgent":
      return "bg-red-100 text-red-800 border border-red-200";
    case "attention":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "info":
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

export function MenuAlertBadge({
  entry,
  className,
}: {
  entry: MenuAlertEntry | undefined;
  className?: string;
}) {
  if (!entry || entry.count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none min-w-[20px]",
        badgeClassForLevel(entry.level),
        entry.level === "urgent" && "animate-pulse",
        className
      )}
    >
      {entry.count}
    </span>
  );
}

function detailToneClass(level: MenuAlertLevel): string {
  switch (level) {
    case "urgent":
      return "border-red-200 bg-red-50 text-red-900";
    case "attention":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "info":
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

function PendingDetailRow({ detail }: { detail: MenuAlertDetail }) {
  return (
    <Link
      href={detail.href}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:opacity-90",
        detailToneClass(detail.level)
      )}
    >
      <span className="font-medium">{detail.label}</span>
      <span className="inline-flex items-center gap-1 text-xs font-semibold shrink-0">
        Ver
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

/** Banner de pendências no topo do conteúdo — rastro do badge do menu lateral. */
export function PagePendingAlerts({ className }: { className?: string }) {
  const pathname = usePathname();
  const { data } = useMenuAlerts();
  const details = data?.details ?? [];
  const pending = getPendingDetailsForPath(pathname, details);

  if (!pending.length) return null;

  const hasUrgent = pending.some((d) => d.level === "urgent");

  return (
    <div
      className={cn(
        "mx-4 md:mx-6 mt-4 rounded-lg border p-3 space-y-2",
        hasUrgent
          ? "border-red-200 bg-red-50/80"
          : "border-amber-200 bg-amber-50/80",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          hasUrgent ? "text-red-800" : "text-amber-800"
        )}
      >
        Pendências nesta área
      </p>
      <div className="space-y-1.5">
        {pending.map((detail) => (
          <PendingDetailRow key={detail.id} detail={detail} />
        ))}
      </div>
    </div>
  );
}

/** Rótulo de aba com badge de alerta (ex.: Contas a Pagar). */
export function TabLabelWithAlert({
  label,
  entry,
}: {
  label: string;
  entry: MenuAlertEntry | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <MenuAlertBadge entry={entry} />
    </span>
  );
}
