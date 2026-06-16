"use client";

import type { FiscalStatus } from "@/modules/fiscal/lib/fiscal-rules-types";
import {
  FISCAL_STATUS_LABELS,
  isFiscalReadyForInvoice,
} from "@/modules/fiscal/lib/fiscal-rules-types";
import { cn } from "@/shared/utils/cn";

const STATUS_STYLES: Record<FiscalStatus, string> = {
  pending: "bg-slate-100 text-slate-800",
  no_rules: "bg-amber-50 text-amber-900 border border-amber-200",
  rules_applied: "bg-sky-100 text-sky-900",
  manual_override: "bg-violet-100 text-violet-900",
  review_required: "bg-orange-100 text-orange-900",
  approved: "bg-emerald-100 text-emerald-900",
};

export function FiscalStatusBadge({
  status,
  className,
}: {
  status: FiscalStatus | string;
  className?: string;
}) {
  const key = (status in FISCAL_STATUS_LABELS ? status : "pending") as FiscalStatus;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
        STATUS_STYLES[key],
        className
      )}
      title={FISCAL_STATUS_LABELS[key]}
    >
      {FISCAL_STATUS_LABELS[key]}
    </span>
  );
}

export function ReadyForInvoiceCompositeBadge({
  readyForInvoice,
  fiscalStatus,
  className,
}: {
  readyForInvoice: boolean;
  fiscalStatus: FiscalStatus | string;
  className?: string;
}) {
  const fiscalKey = (
    fiscalStatus in FISCAL_STATUS_LABELS ? fiscalStatus : "pending"
  ) as FiscalStatus;
  const productionOk = readyForInvoice;
  const fiscalOk = isFiscalReadyForInvoice(readyForInvoice, fiscalKey);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        fiscalOk
          ? "bg-teal-100 text-teal-900"
          : productionOk
            ? "bg-amber-50 text-amber-900 border border-amber-200"
            : "bg-slate-100 text-slate-700",
        className
      )}
      title={`Produção: ${productionOk ? "OK" : "pendente"} · Fiscal: ${FISCAL_STATUS_LABELS[fiscalKey]}`}
    >
      <span>{productionOk ? "Produção ✓" : "Produção …"}</span>
      <span className="opacity-60">·</span>
      <span>
        {isFiscalReadyForInvoice(readyForInvoice, fiscalKey)
          ? "Fiscal ✓"
          : "Fiscal …"}
      </span>
    </span>
  );
}
