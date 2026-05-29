"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NumericInput } from "@/shared/ui/numeric-input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/utils/cn";
import {
  DEFAULT_QUOTE_MARKUP_PERCENT,
  lineTotalPrice,
  unitPriceFromCostAndMarkup,
  type QuoteLinePriceMode,
} from "@/modules/vendas/lib/sales/quote-line-pricing";
import { ProductCatalogPickerModal } from "@/components/products/product-catalog-picker-modal";
import type { ProductSearchHit } from "@/components/products/product-search-types";

export type QuoteLineProduct = {
  id: string;
  code: string | null;
  technical_code: string | null;
  name: string;
  unit: string | null;
  cost_price: number;
};

export type QuoteLineDraft = {
  key: string;
  productId: string;
  quantity: number;
  priceMode: QuoteLinePriceMode;
  markupPercent: number;
  manualPrice: number;
  costPrice: number;
  unitPrice: number;
  unit: string;
  /** Texto livre visível ao cliente na proposta/impressão. */
  clientNotes: string;
};

export function productDisplayLabel(p: QuoteLineProduct): string {
  const sku = p.technical_code?.trim() || p.code?.trim() || "—";
  return `${sku} — ${p.name}`;
}

function hitToProduct(hit: ProductSearchHit): QuoteLineProduct {
  return {
    id: hit.id,
    code: hit.code,
    technical_code: hit.technical_code,
    name: hit.name,
    unit: hit.unit,
    cost_price: Number(hit.cost_price ?? 0),
  };
}

function lineFromProduct(
  hit: ProductSearchHit,
  base?: QuoteLineDraft
): { line: QuoteLineDraft; product: QuoteLineProduct } {
  const p = hitToProduct(hit);
  const cost = Number(p.cost_price ?? 0);
  const markup = DEFAULT_QUOTE_MARKUP_PERCENT;
  const unitPrice = unitPriceFromCostAndMarkup(cost, markup);
  const line: QuoteLineDraft = {
    ...(base ?? newQuoteLine(0)),
    productId: p.id,
    costPrice: cost,
    priceMode: "markup",
    markupPercent: markup,
    manualPrice: unitPrice,
    unitPrice,
    unit: (p.unit && p.unit.trim()) || "UN",
  };
  return { line, product: p };
}

function applyMarkupToLine(
  line: QuoteLineDraft,
  markupPercent: number,
  costPrice?: number
): QuoteLineDraft {
  const cost = costPrice ?? line.costPrice;
  const unitPrice = unitPriceFromCostAndMarkup(cost, markupPercent);
  return {
    ...line,
    costPrice: cost,
    markupPercent,
    unitPrice,
    manualPrice: unitPrice,
  };
}

/** Índice estável para SSR/hidratação (evita `crypto.randomUUID()`). */
export function newQuoteLine(index = 0): QuoteLineDraft {
  return {
    key: `line-${index}`,
    productId: "",
    quantity: 1,
    priceMode: "markup",
    markupPercent: DEFAULT_QUOTE_MARKUP_PERCENT,
    manualPrice: 0,
    costPrice: 0,
    unitPrice: 0,
    unit: "UN",
    clientNotes: "",
  };
}

/** Reatribui `key` sequencial após adicionar/remover linhas. */
export function reindexQuoteLines(lines: QuoteLineDraft[]): QuoteLineDraft[] {
  return lines.map((line, index) => ({
    ...line,
    key: `line-${index}`,
  }));
}

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60 " +
  "dark:bg-slate-950 dark:border-slate-600";

type Props = {
  lines: QuoteLineDraft[];
  onLinesChange: (lines: QuoteLineDraft[]) => void;
  productCache: Record<string, QuoteLineProduct>;
  onProductCacheMerge: (products: Record<string, QuoteLineProduct>) => void;
  /** Orçamento em edição — liga produtos criados pelo comercial. */
  sourceQuoteId?: string | null;
};

export function QuoteItemsEditor({
  lines,
  onLinesChange,
  productCache,
  onProductCacheMerge,
  sourceQuoteId,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLineIndex, setPickerLineIndex] = useState<number | null>(null);

  const productById = useMemo(() => {
    const map = new Map<string, QuoteLineProduct>();
    for (const p of Object.values(productCache)) map.set(p.id, p);
    return map;
  }, [productCache]);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + lineTotalPrice(l.unitPrice, l.quantity),
        0
      ),
    [lines]
  );

  const updateLineAt = (index: number, patch: Partial<QuoteLineDraft>) => {
    onLinesChange(
      reindexQuoteLines(
        lines.map((row, i) => {
          if (i !== index) return row;
          let next: QuoteLineDraft = { ...row, ...patch };

          if (next.priceMode === "markup") {
            next = applyMarkupToLine(next, next.markupPercent, next.costPrice);
          } else {
            const manual =
              patch.manualPrice !== undefined
                ? patch.manualPrice
                : next.manualPrice;
            next = {
              ...next,
              manualPrice: manual,
              unitPrice: manual,
            };
          }

          return next;
        })
      )
    );
  };

  const openProductPicker = (lineIndex: number | null) => {
    setPickerLineIndex(lineIndex);
    setPickerOpen(true);
  };

  const applySelectedProducts = (hits: ProductSearchHit[]) => {
    if (hits.length === 0) return;

    const cache: Record<string, QuoteLineProduct> = {};
    let nextLines = [...lines];
    let remaining = [...hits];

    if (pickerLineIndex !== null && pickerLineIndex < nextLines.length) {
      const { line, product } = lineFromProduct(
        remaining[0],
        nextLines[pickerLineIndex]
      );
      cache[product.id] = product;
      nextLines[pickerLineIndex] = line;
      remaining = remaining.slice(1);
    }

    for (let i = 0; i < nextLines.length && remaining.length > 0; i++) {
      if (pickerLineIndex !== null && i === pickerLineIndex) continue;
      if (!nextLines[i].productId) {
        const { line, product } = lineFromProduct(remaining[0], nextLines[i]);
        cache[product.id] = product;
        nextLines[i] = line;
        remaining = remaining.slice(1);
      }
    }

    for (const hit of remaining) {
      const { line, product } = lineFromProduct(hit, newQuoteLine(nextLines.length));
      cache[product.id] = product;
      nextLines.push(line);
    }

    onProductCacheMerge(cache);
    onLinesChange(reindexQuoteLines(nextLines));
    setPickerLineIndex(null);
  };

  const usedProductIds = lines
    .map((l) => l.productId)
    .filter(Boolean) as string[];

  return (
    <>
      <div className="space-y-4">
        {lines.map((line, index) => {
          const prod = line.productId
            ? productById.get(line.productId)
            : undefined;
          const lineTotal = lineTotalPrice(line.unitPrice, line.quantity);
          return (
            <div
              key={line.key}
              className={cn(
                "rounded-lg border border-slate-200 p-4 space-y-3 dark:border-slate-800"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Item {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                  aria-label={`Remover item ${index + 1}`}
                  onClick={() =>
                    onLinesChange(
                      lines.length <= 1
                        ? lines
                        : reindexQuoteLines(
                            lines.filter((_, i) => i !== index)
                          )
                    )
                  }
                  disabled={lines.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Produto acabado</Label>
                  {prod ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <p className="text-sm text-slate-800 flex-1 min-w-0">
                        {productDisplayLabel(prod)}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => openProductPicker(index)}
                      >
                        <Search className="h-4 w-4" />
                        Alterar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => openProductPicker(index)}
                    >
                      <Search className="h-4 w-4" />
                      Adicionar produto
                    </Button>
                  )}
                </div>

                {prod ? (
                  <div className="space-y-2">
                    <Label>Custo unitário</Label>
                    <p className="text-sm font-medium tabular-nums text-slate-800">
                      {formatBRL(line.costPrice)}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`quote-price-mode-${index}`}>
                    Forma de preço
                  </Label>
                  <select
                    id={`quote-price-mode-${index}`}
                    className={SELECT_CLASS}
                    value={line.priceMode}
                    onChange={(e) => {
                      const mode = e.target.value as QuoteLinePriceMode;
                      if (mode === "markup") {
                        updateLineAt(index, { priceMode: "markup" });
                      } else {
                        const manual =
                          line.manualPrice > 0
                            ? line.manualPrice
                            : line.unitPrice > 0
                              ? line.unitPrice
                              : unitPriceFromCostAndMarkup(
                                  line.costPrice,
                                  line.markupPercent
                                );
                        updateLineAt(index, {
                          priceMode: "manual",
                          manualPrice: manual,
                          unitPrice: manual,
                        });
                      }
                    }}
                    disabled={!line.productId}
                  >
                    <option value="markup">Usar markup (%)</option>
                    <option value="manual">Preço unitário (R$)</option>
                  </select>
                </div>

                {line.priceMode === "markup" ? (
                  <div className="space-y-2">
                    <Label htmlFor={`quote-markup-${index}`}>Markup (%)</Label>
                    <NumericInput
                      id={`quote-markup-${index}`}
                      value={line.markupPercent}
                      onChange={(markup) =>
                        updateLineAt(index, { markupPercent: markup })
                      }
                      maxDecimals={2}
                      disabled={!line.productId}
                    />
                    <p className="text-xs text-slate-500">
                      Preço = custo × (1 + markup/100)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor={`quote-manual-price-${index}`}>
                      Preço unitário (R$)
                    </Label>
                    <NumericInput
                      id={`quote-manual-price-${index}`}
                      value={
                        Number.isFinite(line.manualPrice) ? line.manualPrice : 0
                      }
                      onChange={(manualPrice) =>
                        updateLineAt(index, { manualPrice })
                      }
                      maxDecimals={2}
                      disabled={!line.productId}
                    />
                    <p className="text-xs text-slate-500">
                      Valor fixo de venda (ignora custo e markup)
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor={`quote-qty-${index}`}>Quantidade</Label>
                  <NumericInput
                    id={`quote-qty-${index}`}
                    value={Number.isFinite(line.quantity) ? line.quantity : 0}
                    onChange={(quantity) =>
                      updateLineAt(index, { quantity })
                    }
                    maxDecimals={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Preço unitário (venda)</Label>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatBRL(line.unitPrice)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {line.priceMode === "markup"
                      ? "Calculado pelo markup"
                      : "Definido manualmente"}
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm text-slate-600">
                    Total da linha:{" "}
                    <strong className="text-slate-900 tabular-nums">
                      {formatBRL(lineTotal)}
                    </strong>
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`quote-client-notes-${index}`}>
                    Observações para o cliente
                  </Label>
                  <Textarea
                    id={`quote-client-notes-${index}`}
                    value={line.clientNotes}
                    onChange={(e) =>
                      updateLineAt(index, { clientNotes: e.target.value })
                    }
                    rows={3}
                    placeholder="Ex.: inclui instalação no local, prazo especial, cor RAL específica…"
                    className="resize-y min-h-[72px]"
                  />
                  <p className="text-xs text-slate-500">
                    Opcional. Aparece na impressão do orçamento sob o produto.
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const firstEmpty = lines.findIndex((l) => !l.productId);
            openProductPicker(firstEmpty >= 0 ? firstEmpty : null);
          }}
        >
          <Plus className="h-4 w-4" />
          Adicionar produto
        </Button>
      </div>

      <div className="border-t border-slate-200 pt-4 space-y-1 dark:border-slate-800">
        <p className="text-base font-semibold text-slate-900">
          Subtotal (itens):{" "}
          <span className="tabular-nums">{formatBRL(subtotal)}</span>
        </p>
        <p className="text-xs text-slate-500">
          Descontos e impostos podem ser aplicados no cabeçalho do orçamento.
        </p>
      </div>

      <ProductCatalogPickerModal
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerLineIndex(null);
        }}
        excludeIds={usedProductIds}
        multiSelect
        onComplete={applySelectedProducts}
        productType="finished"
        showNewProductButton
        commercialQuickCreate
        sourceQuoteId={sourceQuoteId}
        title="Pesquisar produto acabado"
      />
    </>
  );
}

/** Monta payload `items` para a API a partir das linhas do formulário. */
export function buildQuoteItemsPayload(
  lines: QuoteLineDraft[],
  productById: Map<string, QuoteLineProduct>
): Array<Record<string, unknown>> | { error: string } {
  const built: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    if (!line.productId.trim()) continue;
    const prod = productById.get(line.productId);
    if (!prod) return { error: "Produto inválido numa linha." };
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { error: "Quantidade inválida (deve ser maior que zero)." };
    }

    const unitPrice =
      line.priceMode === "markup"
        ? unitPriceFromCostAndMarkup(line.costPrice, line.markupPercent)
        : line.manualPrice;

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: "Preço unitário inválido numa linha." };
    }

    const item: Record<string, unknown> = {
      product_id: prod.id,
      description: productDisplayLabel(prod),
      quantity: line.quantity,
      unit_price: unitPrice,
      unit: line.unit.trim() || "UN",
    };

    if (line.priceMode === "markup") {
      item.markup_percent = line.markupPercent;
    } else {
      item.markup_percent = null;
    }

    const notes = line.clientNotes.trim();
    if (notes) {
      item.client_notes = notes;
    }

    built.push(item);
  }

  if (built.length === 0) {
    return { error: "Adicione pelo menos um produto ao orçamento." };
  }

  return built;
}
