"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { formatShortDate } from "@/shared/utils/date";
import { financeDirectionLabel } from "@/modules/finance/lib/finance-line-format";

export function fmtFinanceBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export function FinanceDirectionBadge({
  direction,
}: {
  direction: "in" | "out";
}) {
  if (direction === "in") {
    return (
      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
        {financeDirectionLabel("in")}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-red-50 text-red-800 ring-1 ring-red-200">
      {financeDirectionLabel("out")}
    </span>
  );
}

export function FinanceAmountCell({
  direction,
  amount,
}: {
  direction: "in" | "out";
  amount: number;
}) {
  const formatted = fmtFinanceBrl(amount);
  if (direction === "in") {
    return (
      <span className="tabular-nums font-medium text-emerald-700">
        +{formatted}
      </span>
    );
  }
  return (
    <span className="tabular-nums font-medium text-red-700">−{formatted}</span>
  );
}

export function FinanceBalanceCell({
  amount,
  emphasizeNegative = true,
}: {
  amount: number;
  emphasizeNegative?: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular-nums text-sm font-medium",
        emphasizeNegative && amount < 0 ? "text-red-700" : "text-slate-800"
      )}
    >
      {fmtFinanceBrl(amount)}
    </span>
  );
}

export function FinanceDateCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-sm text-slate-500">—</span>;
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return (
    <span className="text-sm text-slate-700 whitespace-nowrap">
      {formatted === "--" ? "—" : formatted}
    </span>
  );
}

export function FinanceTextCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-sm text-slate-800", className)}>{children}</span>
  );
}

/** Larguras padrão das colunas financeiras unificadas. */
export const FINANCE_TABLE_WIDTHS = {
  description: "w-[22%]",
  entity: "w-[18%]",
  type: "w-[10%]",
  date: "w-[11%]",
  amount: "w-[13%]",
  balance: "w-[14%]",
} as const;
