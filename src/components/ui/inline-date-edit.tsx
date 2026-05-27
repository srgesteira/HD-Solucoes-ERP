"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Props = {
  value: string | null;
  onSave: (value: string | null) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function InlineDateEdit({
  value,
  onSave,
  disabled,
  className,
}: Props) {
  const [local, setLocal] = useState(value?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocal(value?.slice(0, 10) ?? "");
  }, [value]);

  const commit = async () => {
    const next = local.trim() || null;
    const prev = value?.slice(0, 10) ?? null;
    if (next === prev) return;
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <input
        type="date"
        className="h-8 min-w-[7.5rem] rounded-md border border-slate-300 bg-white px-1.5 text-xs"
        value={local}
        disabled={disabled || busy}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
      />
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
      ) : null}
    </span>
  );
}
