"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/shared/utils/cn";

type ProductPrefixTabsProps = {
  codes: string[];
  activeCode: string;
  onChange: (code: string) => void;
  isLoading?: boolean;
  showAllTab?: boolean;
};

export function ProductPrefixTabs({
  codes,
  activeCode,
  onChange,
  isLoading = false,
  showAllTab = true,
}: ProductPrefixTabsProps) {
  const tabs: { value: string; label: string }[] = [];
  if (showAllTab) tabs.push({ value: "", label: "Todos" });
  for (const code of codes) {
    tabs.push({ value: code, label: code });
  }

  if (isLoading && !tabs.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        A carregar abas…
      </div>
    );
  }

  if (!tabs.length) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3"
      role="tablist"
      aria-label="Filtrar por prefixo"
    >
      {tabs.map((tab) => {
        const active = activeCode === tab.value;
        return (
          <button
            key={tab.value || "__all__"}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
