import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/shared/utils/cn";

type AppPageProps = {
  /** Título principal da página. */
  title: ReactNode;
  /** Subtítulo curto (opcional). */
  description?: ReactNode;
  /** Ações no canto direito do cabeçalho (botões, etc). */
  actions?: ReactNode;
  /** Conteúdo da página. */
  children: ReactNode;
  /** Classes extras no container. */
  className?: string;
  /** Define a largura máxima do conteúdo. */
  width?: "narrow" | "default" | "wide" | "full";
  /** Densidade do cabeçalho. */
  density?: "compact" | "comfortable";
  /** Quando definido, mostra um link "voltar" antes do título. */
  backHref?: string;
  /** Label do link voltar (default: "Voltar"). */
  backLabel?: string;
  /** Mantido para compat: alias para width="wide". */
  wide?: boolean;
};

const WIDTHS: Record<NonNullable<AppPageProps["width"]>, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-[96rem]",
  full: "max-w-none",
};

/**
 * Container padrão de páginas internas do app.
 * Garante header consistente (título, descrição, ações, back link) e
 * largura/spacing uniformes. Use SEMPRE para envolver páginas de `(app)`.
 */
export function AppPage({
  title,
  description,
  actions,
  children,
  className,
  width,
  density = "compact",
  backHref,
  backLabel = "Voltar",
  wide = false,
}: AppPageProps) {
  const w: NonNullable<AppPageProps["width"]> = width ?? (wide ? "wide" : "default");
  const titleSize =
    density === "comfortable"
      ? "text-2xl font-semibold tracking-tight"
      : "text-lg font-semibold";
  const descSize =
    density === "comfortable"
      ? "text-sm text-slate-500 mt-1"
      : "text-xs text-slate-500 mt-0.5";
  const containerPad =
    density === "comfortable" ? "p-4 md:p-6 space-y-6" : "p-3 md:p-4 space-y-3";

  return (
    <div
      className={cn("mx-auto w-full", containerPad, WIDTHS[w], className)}
    >
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3 min-h-[2rem]">
        <div className="min-w-0">
          <h1 className={cn("text-slate-900", titleSize)}>{title}</h1>
          {description ? (
            <div className={descSize}>{description}</div>
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
