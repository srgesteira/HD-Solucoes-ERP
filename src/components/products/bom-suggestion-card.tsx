import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { StructureSuggestion } from "@/lib/services/ai.service";
import { Button } from "@/components/ui/button";

type Props = {
  suggestion: StructureSuggestion;
  onDismiss?: () => void;
  /** Se definido (produto já guardado como acabado), link para BOM. */
  structureHref?: string;
};

export function BomSuggestionCard({
  suggestion,
  onDismiss,
  structureHref,
}: Props) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-violet-900">
            Sugestão de BOM (IA)
          </h3>
          <p className="text-xs text-violet-800/90 mt-0.5">
            Revise sempre antes de aplicar na estrutura. Os componentes devem
            corresponder a produtos cadastrados no ERP.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {structureHref ? (
            <Link
              href={structureHref}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-md border border-slate-300",
                "bg-white px-3 text-xs font-medium text-slate-900 hover:bg-slate-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              )}
            >
              Gerir estrutura
            </Link>
          ) : null}
          {onDismiss ? (
            <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
              Fechar
            </Button>
          ) : null}
        </div>
      </div>
      <div className="rounded-md border border-violet-100 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600">
              <th className="p-2">Nome</th>
              <th className="p-2 w-28">Tipo</th>
              <th className="p-2 w-24 text-right">Qtd</th>
              <th className="p-2 w-24">Und.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suggestion.components.map((c, i) => (
              <tr key={`${c.name}-${i}`}>
                <td className="p-2 text-slate-800">{c.name}</td>
                <td className="p-2 text-xs text-slate-600">
                  {c.isLabor ? "Mão de obra" : "Material"}
                </td>
                <td className="p-2 text-right tabular-nums">{c.quantity}</td>
                <td className="p-2">{c.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
