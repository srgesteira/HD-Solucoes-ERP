import { cn } from "@/lib/utils/cn";

type Props = {
  title: string;
  value: string;
  subtitle?: string;
  className?: string;
};

export function KpiCard({ title, value, subtitle, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      ) : null}
    </div>
  );
}
