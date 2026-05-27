"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  decimalToFocusString,
  formatDecimalDisplay,
  isValidDecimalTyping,
  normalizeDecimalTyping,
  parseDecimalInput,
} from "@/lib/numbers/decimal-input";

export type DecimalInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: number;
  onValueChange: (value: number) => void;
  maxDecimals?: number;
  allowEmpty?: boolean;
};

export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  (
    {
      value,
      onValueChange,
      maxDecimals = 2,
      allowEmpty = false,
      className,
      onFocus,
      onBlur,
      placeholder = "0,00",
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState("");

    React.useEffect(() => {
      if (!focused) {
        if (allowEmpty && value === 0) {
          setDraft("");
        } else {
          setDraft(formatDecimalDisplay(value, maxDecimals));
        }
      }
    }, [value, focused, maxDecimals, allowEmpty]);

    const commitDraft = (raw: string) => {
      const norm = normalizeDecimalTyping(raw);
      if (norm === "" || norm === ".") {
        onValueChange(allowEmpty ? 0 : 0);
        return;
      }
      onValueChange(parseDecimalInput(norm, 0));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className={cn("tabular-nums", className)}
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          setDraft(decimalToFocusString(value, maxDecimals));
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          commitDraft(draft);
          onBlur?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          const norm = normalizeDecimalTyping(raw);
          if (!isValidDecimalTyping(norm, maxDecimals)) return;
          setDraft(raw);
          if (norm === "" || norm === ".") {
            if (allowEmpty) onValueChange(0);
            return;
          }
          onValueChange(parseDecimalInput(norm, 0));
        }}
        {...props}
      />
    );
  }
);

DecimalInput.displayName = "DecimalInput";
