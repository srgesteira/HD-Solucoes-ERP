"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { cn } from "@/shared/utils/cn";

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
  const [busy, setBusy] = useState(false);

  const handleChange = async (next: string | null) => {
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
      <BrDateInput
        value={value?.slice(0, 10) ?? null}
        onChange={(iso) => void handleChange(iso)}
        disabled={disabled || busy}
        variant="compact"
        className="h-8 min-w-[5.5rem] max-w-[6.25rem] text-center"
      />
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
      ) : null}
    </span>
  );
}
