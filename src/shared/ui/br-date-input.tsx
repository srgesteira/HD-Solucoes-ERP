"use client";

import { useEffect, useState } from "react";
import {
  isoToBrazilianDateInput,
  parseBrazilianDateInput,
} from "@/shared/utils/date";
import { cn } from "@/shared/utils/cn";

type Props = {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  id?: string;
  variant?: "default" | "compact";
};

const VARIANT_CLASS = {
  default:
    "flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-60 tabular-nums",
  compact:
    "rounded-md border border-slate-300 bg-white px-1.5 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-60",
} as const;

export function BrDateInput({
  value,
  onChange,
  disabled,
  className,
  placeholder = "dd/mm/aa",
  title,
  id,
  variant = "default",
}: Props) {
  const [text, setText] = useState(() => isoToBrazilianDateInput(value));

  useEffect(() => {
    setText(isoToBrazilianDateInput(value));
  }, [value]);

  const commit = () => {
    const parsed = parseBrazilianDateInput(text);
    const prev = value?.slice(0, 10) ?? null;
    if (text.trim() === "" && prev !== null) {
      onChange(null);
      return;
    }
    if (parsed && parsed !== prev) {
      onChange(parsed);
      setText(isoToBrazilianDateInput(parsed));
    } else if (!parsed && text.trim() !== "") {
      setText(isoToBrazilianDateInput(value));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      id={id}
      className={cn(VARIANT_CLASS[variant], className)}
      value={text}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
