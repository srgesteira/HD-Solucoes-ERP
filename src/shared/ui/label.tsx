import * as React from "react";
import { cn } from "@/shared/utils/cn";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-sm font-medium text-slate-700 mb-1 inline-block",
        className
      )}
      {...props}
    />
  );
}
