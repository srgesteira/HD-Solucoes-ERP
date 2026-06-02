"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export type ClassificationOption = {
  id: string;
  code: string;
  name: string;
  sort_order?: number | null;
};

type Props = {
  id?: string;
  label: string;
  value: string;
  options: ClassificationOption[];
  loading?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  addLabel: string;
  addDisabled?: boolean;
  addDisabledHint?: string;
  onChange: (id: string) => void;
  onAddClick: () => void;
};

function optionLabel(row: ClassificationOption): string {
  return `${row.code} — ${row.name}`;
}

export function ClassificationSelectWithAdd({
  id,
  label,
  value,
  options,
  loading = false,
  disabled = false,
  required = false,
  placeholder = "Selecionar…",
  emptyLabel = "Nenhum item cadastrado",
  addLabel,
  addDisabled = false,
  addDisabledHint,
  onChange,
  onAddClick,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.id === value);
  const triggerDisabled = disabled || loading;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="space-y-2" ref={rootRef}>
      <span
        id={id ? `${id}-label` : undefined}
        className="text-sm font-medium leading-none text-slate-900"
      >
        {label}
        {required ? " *" : ""}
      </span>
      <div className="relative">
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={id ? `${id}-label` : undefined}
          disabled={triggerDisabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
            "disabled:cursor-not-allowed disabled:opacity-60",
            !selected && "text-slate-500"
          )}
          onClick={() => {
            if (!triggerDisabled) setOpen((v) => !v);
          }}
        >
          <span className="truncate text-left">
            {loading
              ? "A carregar…"
              : selected
                ? optionLabel(selected)
                : placeholder}
          </span>
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />
          ) : (
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden
            />
          )}
        </button>

        {open && !triggerDisabled ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-slate-500">{emptyLabel}</li>
            ) : (
              options.map((row) => (
                <li key={row.id} role="option" aria-selected={row.id === value}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full px-3 py-2 text-left hover:bg-slate-50",
                      row.id === value && "bg-brand-50 text-brand-900 font-medium"
                    )}
                    onClick={() => {
                      onChange(row.id);
                      setOpen(false);
                    }}
                  >
                    {optionLabel(row)}
                  </button>
                </li>
              ))
            )}
            <li className="border-t border-slate-200 mt-1 pt-1">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-brand-700 font-medium hover:bg-brand-50",
                  addDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
                )}
                disabled={addDisabled}
                title={addDisabled ? addDisabledHint : undefined}
                onClick={() => {
                  if (addDisabled) return;
                  setOpen(false);
                  onAddClick();
                }}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                {addLabel}
              </button>
            </li>
          </ul>
        ) : null}
      </div>
      {addDisabled && addDisabledHint ? (
        <p className="text-xs text-slate-500">{addDisabledHint}</p>
      ) : null}
    </div>
  );
}
