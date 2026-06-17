"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/cn";

/** Tokens visuais partilhados — cronograma em linhas (referência: Compras). */
export const CRONOGRAMA_TOKENS = {
  cellText: "text-xs text-slate-800",
  cellMuted: "text-xs text-slate-700 tabular-nums",
  cellLink: "font-mono text-xs text-brand-700 hover:underline",
  badge: "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 whitespace-nowrap",
  rowHover: "hover:bg-slate-50/60",
} as const;

type CronogramaSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  onDebouncedChange?: (value: string) => void;
};

export function CronogramaSearch({
  value,
  onChange,
  placeholder = "Buscar por código, cliente, fornecedor, data, produto…",
  className,
  debounceMs = 380,
  onDebouncedChange,
}: CronogramaSearchProps) {
  useEffect(() => {
    if (!onDebouncedChange) return;
    const t = window.setTimeout(() => onDebouncedChange(value), debounceMs);
    return () => window.clearTimeout(t);
  }, [value, debounceMs, onDebouncedChange]);

  return (
    <div className={cn("relative w-full", className)}>
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9 text-sm"
        aria-label="Buscar no cronograma"
      />
    </div>
  );
}

type CronogramaTabOption = {
  value: string;
  label: ReactNode;
  className?: string;
};

type CronogramaTabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  tabs: CronogramaTabOption[];
  children: ReactNode;
  className?: string;
};

export function CronogramaTabs({
  value,
  onValueChange,
  tabs,
  children,
  className,
}: CronogramaTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList className="w-full flex flex-wrap h-auto gap-1">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={cn("text-xs sm:text-sm", tab.className)}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}

type CronogramaPanelProps = {
  search?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function CronogramaPanel({
  search,
  error,
  children,
  footer,
  className,
}: CronogramaPanelProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {search}
      {error}
      {children}
      {footer}
    </div>
  );
}

export function CronogramaTabPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContent value={value} className={cn("mt-4", className)}>
      {children}
    </TabsContent>
  );
}

type CronogramaErrorProps = {
  message: string;
  onRetry?: () => void;
};

export function CronogramaError({ message, onRetry }: CronogramaErrorProps) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-red-800">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

type CronogramaPaginationProps = {
  page: number;
  totalPages: number;
  rangeDescription?: string;
  onPageChange: (page: number) => void;
  itemCount?: number;
};

export function CronogramaPagination({
  page,
  totalPages,
  rangeDescription,
  onPageChange,
  itemCount,
}: CronogramaPaginationProps) {
  if (totalPages <= 1 && !rangeDescription) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
      {rangeDescription ? (
        <p className="text-xs text-slate-500">
          {itemCount != null ? (
            <>
              Registos nesta página: {itemCount}. Intervalo total:{" "}
            </>
          ) : null}
          <span className="font-medium text-slate-700">{rangeDescription}</span>
        </p>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <span className="text-xs tabular-nums px-2 text-slate-600">
          Página {page} / {Math.max(1, totalPages)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Página seguinte"
        >
          Seguinte
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CronogramaLoading({ message = "A carregar…" }: { message?: string }) {
  return (
    <p className="text-sm text-slate-500 flex items-center gap-2 py-12 justify-center">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {message}
    </p>
  );
}

/** Hook auxiliar: input imediato + valor debounced para queries. */
export function useCronogramaSearch(initial = "") {
  const [input, setInput] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(input.trim()), 380);
    return () => window.clearTimeout(t);
  }, [input]);

  return { input, setInput, debounced, setDebounced };
}
