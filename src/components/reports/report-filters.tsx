"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { cn } from "@/shared/utils/cn";

export type PeriodPreset = "last_month" | "last_quarter" | "year" | "custom";

export type ReportDateRange = { from: string; to: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFromPreset(preset: PeriodPreset): ReportDateRange {
  const to = new Date();
  const end = isoDate(to);
  const t = new Date(to);
  if (preset === "last_month") {
    t.setMonth(t.getMonth() - 1);
    return { from: isoDate(t), to: end };
  }
  if (preset === "last_quarter") {
    t.setMonth(t.getMonth() - 3);
    return { from: isoDate(t), to: end };
  }
  if (preset === "year") {
    t.setFullYear(t.getFullYear() - 1);
    return { from: isoDate(t), to: end };
  }
  return { from: end, to: end };
}

export type ReportFiltersProps = {
  /** Texto do botão principal (ex.: «Actualizar» / «Gerar»). */
  actionLabel?: string;
  /** Mostrar select de período (útil em relatórios que não dependem de intervalo). */
  showPeriod?: boolean;
  /** Conteúdo extra (status, tipo, etc.). */
  children?: React.ReactNode;
  /** Estado de carregamento do botão. */
  loading?: boolean;
  className?: string;
  onApply: (range: ReportDateRange, preset: PeriodPreset) => void;
};

export function ReportFilters({
  actionLabel = "Actualizar",
  showPeriod = true,
  children,
  loading,
  className,
  onApply,
}: ReportFiltersProps) {
  const [preset, setPreset] = useState<PeriodPreset>("last_quarter");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const derived = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom || isoDate(new Date()),
        to: customTo || isoDate(new Date()),
      };
    }
    return rangeFromPreset(preset);
  }, [preset, customFrom, customTo]);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end",
        className
      )}
    >
      {showPeriod ? (
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <Label htmlFor="report-period">Período</Label>
          <select
            id="report-period"
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
          >
            <option value="last_month">Último mês</option>
            <option value="last_quarter">Último trimestre</option>
            <option value="year">Último ano</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
      ) : null}

      {showPeriod && preset === "custom" ? (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="report-from">De</Label>
            <BrDateInput
              id="report-from"
              value={customFrom || null}
              onChange={(iso) => setCustomFrom(iso ?? "")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-to">Até</Label>
            <BrDateInput
              id="report-to"
              value={customTo || null}
              onChange={(iso) => setCustomTo(iso ?? "")}
            />
          </div>
        </div>
      ) : null}

      {children}

      <Button
        type="button"
        className="sm:ml-auto bg-brand-700 hover:bg-brand-800"
        disabled={loading}
        onClick={() => onApply(derived, preset)}
      >
        {loading ? "A processar…" : actionLabel}
      </Button>
    </div>
  );
}
