import { cn } from "@/shared/utils/cn";
import type { ReactNode } from "react";

type AppPageProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
};

export function AppPage({
  title,
  description,
  actions,
  children,
  className,
  wide = false,
}: AppPageProps) {
  return (
    <div
      className={cn(
        "p-3 mx-auto space-y-3",
        wide ? "max-w-[96rem]" : "max-w-6xl",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[2rem]">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900 truncate">
            {title}
          </h1>
          {description ? (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
