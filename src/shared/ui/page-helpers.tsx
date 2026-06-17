import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";

/* ---------------------------------------------------------------------
 * LoadingState — spinner centralizado padrão.
 * ------------------------------------------------------------------- */
type LoadingStateProps = {
  label?: string;
  className?: string;
  /** "block" (default) preenche a coluna; "inline" fica em linha. */
  variant?: "block" | "inline";
};

export function LoadingState({
  label = "Carregando…",
  className,
  variant = "block",
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 text-xs text-slate-500",
          className
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {label}
      </span>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-slate-500",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * EmptyState — placeholder neutro para listagens sem dados.
 * ------------------------------------------------------------------- */
type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-12 px-6 text-center",
        className
      )}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? (
          <p className="text-xs text-slate-500 mt-1 max-w-md">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------
 * ErrorState — banner para erros recuperáveis.
 * ------------------------------------------------------------------- */
type ErrorStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Ocorreu um erro",
  message,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 p-4 text-red-900",
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs mt-1 text-red-800/90 break-words">{message}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * StatusBadge — pílula colorida padronizada por tom semântico.
 * ------------------------------------------------------------------- */
export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "brand";

type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
  size?: "xs" | "sm";
};

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  muted: "bg-slate-50 text-slate-500 border-slate-200",
  brand: "bg-brand-50 text-brand-800 border-brand-200",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  icon: Icon,
  size = "sm",
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "xs"
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-2 py-0.5 text-xs",
        TONE_STYLES[tone],
        className
      )}
    >
      {Icon ? <Icon className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------
 * PageSection — subseção com título dentro de AppPage.
 * ------------------------------------------------------------------- */
type PageSectionProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------------
 * KpiCard — card de indicador com label, valor e hint.
 * ------------------------------------------------------------------- */
type KpiCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
};

const KPI_VALUE_TONE: Record<StatusTone, string> = {
  neutral: "text-slate-900",
  info: "text-sky-700",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-rose-700",
  muted: "text-slate-600",
  brand: "text-brand-700",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {Icon ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-slate-500">
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          KPI_VALUE_TONE[tone]
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------
 * DataList — grade definição/valor para resumos.
 * ------------------------------------------------------------------- */
type DataListProps = {
  items: Array<{
    label: ReactNode;
    value: ReactNode;
    span?: 1 | 2;
  }>;
  columns?: 1 | 2 | 3;
  className?: string;
};

export function DataList({ items, columns = 2, className }: DataListProps) {
  const colsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : "sm:grid-cols-2";
  return (
    <dl className={cn("grid gap-3", colsClass, className)}>
      {items.map((it, idx) => (
        <div
          key={idx}
          className={cn(
            "min-w-0",
            it.span === 2 ? "sm:col-span-2" : ""
          )}
        >
          <dt className="text-xs text-slate-500">{it.label}</dt>
          <dd className="text-sm font-medium text-slate-900 mt-0.5 break-words">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
