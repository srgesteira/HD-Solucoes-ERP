"use client";

import * as React from "react";
import { DecimalInput, type DecimalInputProps } from "@/shared/ui/decimal-input";

export type NumericInputProps = Omit<DecimalInputProps, "onValueChange"> & {
  /** Valor numérico atual. */
  value: number;
  /** Callback ao alterar o valor (equivalente a onValueChange do DecimalInput). */
  onChange: (value: number) => void;
};

/**
 * Input decimal sem spinners; aceita vírgula ou ponto.
 * Alias amigável de {@link DecimalInput} para uso em formulários.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, maxDecimals = 2, ...props }, ref) => {
    return (
      <DecimalInput
        ref={ref}
        value={value}
        onValueChange={onChange}
        maxDecimals={maxDecimals}
        {...props}
      />
    );
  }
);

NumericInput.displayName = "NumericInput";
