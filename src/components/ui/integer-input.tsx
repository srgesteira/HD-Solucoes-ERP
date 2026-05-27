"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { isValidIntegerTyping, parseIntegerInput } from "@/lib/numbers/decimal-input";

export type IntegerInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

export const IntegerInput = React.forwardRef<HTMLInputElement, IntegerInputProps>(
  ({ value, onValueChange, className, onBlur, ...props }, ref) => {
    const [draft, setDraft] = React.useState(String(value || ""));

    React.useEffect(() => {
      setDraft(value > 0 ? String(value) : "");
    }, [value]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn("tabular-nums", className)}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidIntegerTyping(raw)) return;
          setDraft(raw);
          onValueChange(parseIntegerInput(raw, 0));
        }}
        onBlur={(e) => {
          const n = parseIntegerInput(draft, 0);
          setDraft(n > 0 ? String(n) : "");
          onValueChange(n);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  }
);

IntegerInput.displayName = "IntegerInput";
