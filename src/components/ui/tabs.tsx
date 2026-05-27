"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error("Tabs components must be used within <Tabs>");
  }
  return ctx;
}

type TabsProps = React.HTMLAttributes<HTMLDivElement> & {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

export function Tabs({
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = controlledValue ?? uncontrolled;

  const handleChange = React.useCallback(
    (next: string) => {
      if (controlledValue === undefined) {
        setUncontrolled(next);
      }
      onValueChange?.(next);
    },
    [controlledValue, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <div className={cn("space-y-4", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-600",
        className
      )}
      {...props}
    />
  );
}

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const { value: active, onValueChange } = useTabsContext();
  const isActive = active === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2",
        isActive
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-600 hover:text-slate-900",
        className
      )}
      onClick={() => onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
}

type TabsContentProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string;
};

export function TabsContent({
  value,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { value: active } = useTabsContext();
  if (active !== value) return null;

  return (
    <div
      role="tabpanel"
      data-state="active"
      className={cn("focus-visible:outline-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}
