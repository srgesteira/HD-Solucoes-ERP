"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calculator,
  Check,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/utils/cn";
import { fmtBRL } from "@/shared/utils/format-brl";
import type { QuoteApiItem } from "@/modules/vendas/lib/sales/quote-form-hydrate";
import { itemsToLinesAndCache } from "@/modules/vendas/lib/sales/quote-form-hydrate";
import {
  acknowledgeQuoteCostReview,
  analyzeQuoteMarkupLines,
  bdiBreakdownForCost,
  loadBdiPricingContext,
  markupPercentFromPrices,
  type QuoteMarkupLineAnalysis,
} from "@/modules/vendas/lib/sales/quote-markup-analysis";
import type { QuoteLineDraft } from "@/components/sales/quote-items-editor";
import {
  DEFAULT_QUOTE_MARKUP_PERCENT,
  unitPriceFromCostAndMarkup,
} from "@/modules/vendas/lib/sales/quote-line-pricing";

type Props = {
  quoteId: string;
  quoteStatus: string;
  items: QuoteApiItem[];
  canAct: boolean;
  onApplyBdiPrices?: (lines: QuoteLineDraft[]) => void;
  onAcknowledged?: () => void;
};

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function QuoteCostReviewPanel({
  quoteId,
  quoteStatus,
  items,
  canAct,
  onApplyBdiPrices,
  onAcknowledged,
}: Props) {
  const queryClient = useQueryClient();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const bdiQuery = useQuery({
    queryKey: ["settings-bdi"],
    queryFn: loadBdiPricingContext,
  });

  const analysis = useMemo(() => {
    if (!bdiQuery.data) return null;
    const mapped = items.map((item) => {
      const prod = Array.isArray(item.product) ? item.product[0] : item.product;
      return {
        id: (item as { id?: string }).id,
        product_id: item.product_id,
        description: (item as { description?: string }).description ?? null,
        unit_price: Number(item.unit_price),
        quantity: Number(item.quantity),
        markup_percent: item.markup_percent,
        product: prod
          ? {
              cost_price: prod.cost_price,
              name: prod.name,
              technical_code: prod.technical_code,
              code: prod.code,
            }
          : null,
      };
    });
    return analyzeQuoteMarkupLines(
      mapped,
      bdiQuery.data.settings,
      bdiQuery.data.companyTaxRegime,
      bdiQuery.data.companyDasAliquot
    );
  }, [bdiQuery.data, items]);

  const sampleBreakdown = useMemo(() => {
    if (!bdiQuery.data || !analysis?.lines[0]) return [];
    return bdiBreakdownForCost(
      analysis.lines[0].cost,
      bdiQuery.data.settings,
      bdiQuery.data.companyTaxRegime,
      bdiQuery.data.companyDasAliquot
    );
  }, [analysis?.lines, bdiQuery.data]);

  const ackMut = useMutation({
    mutationFn: () => acknowledgeQuoteCostReview(quoteId),
    onSuccess: async () => {
      toast.success("Preço acordado confirmado — destaque removido.");
      await queryClient.invalidateQueries({ queryKey: ["sales-quote", quoteId] });
      await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
      onAcknowledged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyBdiMut = useMutation({
    mutationFn: async () => {
      if (!analysis || !onApplyBdiPrices) {
        throw new Error("Não foi possível aplicar o BDI.");
      }
      const { lines } = itemsToLinesAndCache(items);
      const next = lines.map((line) => {
        const row = analysis.lines.find((r) => r.productId === line.productId);
        if (!row || row.cost <= 0) return line;
        const markup =
          markupPercentFromPrices(row.cost, row.bdiSuggestedPrice) ??
          DEFAULT_QUOTE_MARKUP_PERCENT;
        const unitPrice = unitPriceFromCostAndMarkup(row.cost, markup);
        return {
          ...line,
          priceMode: "markup" as const,
          costPrice: row.cost,
          markupPercent: markup,
          manualPrice: unitPrice,
          unitPrice,
        };
      });
      onApplyBdiPrices(next);
    },
    onSuccess: () => {
      toast.success("Preços recalculados com BDI — grave o orçamento para confirmar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (bdiQuery.isLoading) {
    return (
      <Card className="border-brand-200 bg-brand-50/60">
        <CardContent className="py-4 flex items-center gap-2 text-sm text-brand-900">
          <Loader2 className="h-4 w-4 animate-spin" />
          A analisar custos e markup…
        </CardContent>
      </Card>
    );
  }

  if (bdiQuery.isError || !analysis) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-4 text-sm text-amber-900">
          Não foi possível carregar a análise de markup.
        </CardContent>
      </Card>
    );
  }

  const sentToClient = quoteStatus === "sent" || quoteStatus === "approved";
  const busy = ackMut.isPending || applyBdiMut.isPending;

  return (
    <Card className="border-brand-300 bg-brand-50/80 ring-1 ring-brand-400/40">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2 text-brand-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Custo do produto actualizado
            </CardTitle>
            <p className="text-sm text-brand-900/90">
              {sentToClient
                ? "Este orçamento já foi enviado ao cliente. Compare o preço acordado com o custo actual e o ponto de equilíbrio (BDI)."
                : "A engenharia actualizou o custo. Revise markup e preços antes de enviar."}
            </p>
            {analysis.linesBelowMin > 0 && analysis.minMarkupPct > 0 ? (
              <p className="text-sm font-medium text-red-700">
                {analysis.linesBelowMin === 1
                  ? "1 item está abaixo do markup mínimo configurado"
                  : `${analysis.linesBelowMin} itens estão abaixo do markup mínimo configurado`}
                {" "}
                ({analysis.minMarkupPct}%).
              </p>
            ) : (
              <p className="text-sm text-brand-800">{analysis.listHint}.</p>
            )}
          </div>
          {canAct ? (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-white"
                disabled={busy}
                onClick={() => ackMut.mutate()}
              >
                {ackMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Preço acordado — OK
              </Button>
              {onApplyBdiPrices ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || analysis.lines.length === 0}
                  onClick={() => applyBdiMut.mutate()}
                >
                  {applyBdiMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4" />
                  )}
                  Aplicar preços BDI
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="overflow-x-auto rounded-lg border border-brand-200 bg-white">
          <table className="w-full text-xs sm:text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium text-right">Custo</th>
                <th className="px-3 py-2 font-medium text-right">Preço orçado</th>
                <th className="px-3 py-2 font-medium text-right">Markup actual</th>
                <th className="px-3 py-2 font-medium text-right">Preço BDI</th>
                <th className="px-3 py-2 font-medium text-right">Markup BDI</th>
              </tr>
            </thead>
            <tbody>
              {analysis.lines.map((line) => (
                <MarkupLineRow key={line.lineId ?? line.label} line={line} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-brand-800 underline-offset-2 hover:underline"
            onClick={() => setShowBreakdown((v) => !v)}
          >
            <Calculator className="h-3.5 w-3.5" />
            {showBreakdown ? "Ocultar" : "Ver"} composição do preço (BDI)
          </button>
          <Link
            href="/settings/bdi"
            className="inline-flex items-center gap-1 text-brand-800 underline-offset-2 hover:underline"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configurar impostos, despesas e markup mínimo
          </Link>
        </div>

        {showBreakdown && sampleBreakdown.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Exemplo (1.º item com custo): ponto de equilíbrio BDI
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sampleBreakdown.map((part) => (
                <div
                  key={part.label}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-2 py-1.5 text-xs"
                >
                  <span>{part.label}</span>
                  <span className="tabular-nums font-medium">{fmtBRL(part.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MarkupLineRow({ line }: { line: QuoteMarkupLineAnalysis }) {
  return (
    <tr
      className={cn(
        "border-b border-slate-100",
        line.belowMinMarkup && "bg-red-50/80"
      )}
    >
      <td className="px-3 py-2">
        <span className="font-medium text-slate-900">{line.label}</span>
        {line.belowMinMarkup ? (
          <span className="mt-0.5 block text-[11px] font-medium text-red-700">
            Abaixo do markup mínimo
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(line.cost)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        {fmtBRL(line.unitPrice)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {fmtPct(line.quotedMarkupPct)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-brand-800">
        {fmtBRL(line.bdiSuggestedPrice)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-brand-800">
        {fmtPct(line.bdiMarkupPct)}
      </td>
    </tr>
  );
}
