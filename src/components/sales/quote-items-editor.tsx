"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { NumericInput } from "@/shared/ui/numeric-input";
import { Textarea } from "@/shared/ui/textarea";
import {
  DEFAULT_QUOTE_MARKUP_PERCENT,
  lineNetTotalPrice,
  lineTotalPrice,
  unitPriceFromCostAndMarkup,
  type QuoteLinePriceMode,
} from "@/modules/vendas/lib/sales/quote-line-pricing";
import { ProductComboboxField } from "@/components/products/product-combobox-field";
import type { ProductSearchHit } from "@/components/products/product-search-types";

export type QuoteLineProduct = {
  id: string;
  code: string | null;
  technical_code: string | null;
  name: string;
  /** Descrição cadastral do produto (visível no orçamento). */
  description?: string | null;
  unit: string | null;
  cost_price: number;
  product_nature?: string | null;
  prefix_code?: string | null;
};

import {
  ITEM_USAGE_TYPE_OPTIONS,
  isItemUsageType,
  suggestUsageTypeFromProductNature,
  type ItemUsageType,
} from "@/modules/fiscal/lib/item-usage-type";

export type QuoteLineDraft = {
  key: string;
  productId: string;
  quantity: number;
  priceMode: QuoteLinePriceMode;
  markupPercent: number;
  manualPrice: number;
  costPrice: number;
  unitPrice: number;
  /** Desconto da linha em R$. */
  discount: number;
  unit: string;
  /** Texto livre visível ao cliente na proposta/impressão. */
  clientNotes: string;
  /** Observação operacional da linha (embaixo da descrição). */
  itemNotes: string;
  /** Incluir descrição cadastrada do produto na impressão desta linha. */
  showProductDescription: boolean;
  /** Utilização fiscal da linha (consumo / matéria-prima / revenda). */
  usageType: ItemUsageType | "";
};

export function productDisplayLabel(p: QuoteLineProduct): string {
  const sku = p.technical_code?.trim() || p.code?.trim() || "—";
  return `${sku} — ${p.name}`;
}

export function productCodeLabel(p: QuoteLineProduct | undefined): string {
  if (!p) return "—";
  return p.technical_code?.trim() || p.code?.trim() || "—";
}

export function productDescriptionLabel(
  p: QuoteLineProduct | undefined
): string {
  if (!p) return "—";
  // Na proposta, a descrição comercial é o nome do produto.
  const name = p.name?.trim();
  if (name) return name;
  return p.description?.trim() || "—";
}

function hitToProduct(hit: ProductSearchHit): QuoteLineProduct {
  return {
    id: hit.id,
    code: hit.code,
    technical_code: hit.technical_code,
    name: hit.name,
    description: hit.description ?? null,
    unit: hit.unit,
    cost_price: Number(hit.cost_price ?? 0),
    product_nature: hit.product_nature ?? null,
    prefix_code: hit.prefix?.code ?? null,
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
    usageType:
      base?.usageType ||
      suggestUsageTypeFromProductNature(p.product_nature, p.prefix_code) ||
      "",
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
let quoteLineKeySeq = 0;

export function newQuoteLine(index = 0): QuoteLineDraft {
  quoteLineKeySeq += 1;
  return {
    key: `line-${quoteLineKeySeq}-${index}`,
    productId: "",
    quantity: 1,
    priceMode: "markup",
    markupPercent: DEFAULT_QUOTE_MARKUP_PERCENT,
    manualPrice: 0,
    costPrice: 0,
    unitPrice: 0,
    discount: 0,
    unit: "UN",
    clientNotes: "",
    itemNotes: "",
    showProductDescription: false,
    usageType: "",
  };
}

/**
 * Garante keys estáveis. Não renumerar keys no reorder — senão o React
 * remonta as linhas e a sequência “salta”.
 */
export function reindexQuoteLines(lines: QuoteLineDraft[]): QuoteLineDraft[] {
  return lines.map((line, index) => {
    if (line.key && line.key.trim()) return line;
    quoteLineKeySeq += 1;
    return { ...line, key: `line-${quoteLineKeySeq}-${index}` };
  });
}

/** Move item para posição 1-based; os restantes deslocam-se (10→5: antigo 5 vira 6…). */
export function moveQuoteLineToPosition(
  lines: QuoteLineDraft[],
  fromIndex: number,
  rawPosition: number
): QuoteLineDraft[] {
  if (!Number.isFinite(rawPosition) || lines.length === 0) return lines;
  const toIndex = Math.min(
    lines.length - 1,
    Math.max(0, Math.trunc(rawPosition) - 1)
  );
  if (
    fromIndex < 0 ||
    fromIndex >= lines.length ||
    toIndex === fromIndex
  ) {
    return lines;
  }
  const next = [...lines];
  const [row] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, row);
  return reindexQuoteLines(next);
}

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

const SELECT_CLASS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:bg-slate-950 dark:border-slate-600";

type Props = {
  lines: QuoteLineDraft[];
  onLinesChange: (lines: QuoteLineDraft[]) => void;
  productCache: Record<string, QuoteLineProduct>;
  onProductCacheMerge: (products: Record<string, QuoteLineProduct>) => void;
  /** Orçamento em edição — liga produtos criados pelo comercial. */
  sourceQuoteId?: string | null;
  /** Só em rascunho: permite alterar a sequência. */
  allowReorder?: boolean;
};

export function QuoteItemsEditor({
  lines,
  onLinesChange,
  productCache,
  onProductCacheMerge,
  sourceQuoteId,
  allowReorder = true,
}: Props) {
  /** Valor a editar na Seq. (só aplica ao blur/Enter). */
  const [seqDraft, setSeqDraft] = useState<{
    key: string;
    value: string;
  } | null>(null);

  const productById = useMemo(() => {
    const map = new Map<string, QuoteLineProduct>();
    for (const p of Object.values(productCache)) map.set(p.id, p);
    return map;
  }, [productCache]);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum + lineNetTotalPrice(l.unitPrice, l.quantity, l.discount),
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

  const addEmptyLine = () => {
    onLinesChange(reindexQuoteLines([...lines, newQuoteLine(lines.length)]));
  };

  const moveLine = (index: number, direction: -1 | 1) => {
    if (!allowReorder) return;
    onLinesChange(
      moveQuoteLineToPosition(lines, index, index + direction + 1)
    );
  };

  /** Move a linha para a posição 1-based; os outros deslocam-se automaticamente. */
  const moveLineToPosition = (fromIndex: number, rawPosition: number) => {
    if (!allowReorder) return;
    onLinesChange(moveQuoteLineToPosition(lines, fromIndex, rawPosition));
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <ul className="space-y-3 w-full min-w-0">
        {lines.map((line, index) => {
          const prod = line.productId
            ? productById.get(line.productId)
            : undefined;
          const lineGross = lineTotalPrice(line.unitPrice, line.quantity);
          const lineTotal = lineNetTotalPrice(
            line.unitPrice,
            line.quantity,
            line.discount
          );
          const code = productCodeLabel(prod);
          const description = productDescriptionLabel(prod);

          return (
            <li
              key={line.key}
              className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-950/40"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex shrink-0 items-start gap-1">
                  {allowReorder ? (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={`Mover item ${index + 1} para cima`}
                          title="Subir"
                          disabled={index === 0}
                          onClick={() => moveLine(index, -1)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={`Mover item ${index + 1} para baixo`}
                          title="Descer"
                          disabled={index === lines.length - 1}
                          onClick={() => moveLine(index, 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] uppercase tracking-wide text-slate-500">
                          Seq.
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={lines.length}
                          step={1}
                          value={
                            seqDraft?.key === line.key
                              ? seqDraft.value
                              : String(index + 1)
                          }
                          onFocus={() =>
                            setSeqDraft({
                              key: line.key,
                              value: String(index + 1),
                            })
                          }
                          onChange={(e) =>
                            setSeqDraft({
                              key: line.key,
                              value: e.target.value,
                            })
                          }
                          onBlur={() => {
                            const raw =
                              seqDraft?.key === line.key
                                ? Number(seqDraft.value)
                                : index + 1;
                            setSeqDraft(null);
                            if (!Number.isFinite(raw)) return;
                            moveLineToPosition(index, raw);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }}
                          aria-label={`Sequência do item (posição actual ${index + 1})`}
                          title="Digite a posição e Enter — os outros itens deslocam-se"
                          className="h-8 w-12 px-1 text-center text-sm tabular-nums"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-0.5">
                      <Label className="text-[10px] uppercase tracking-wide text-slate-500">
                        Seq.
                      </Label>
                      <span className="inline-flex h-8 w-12 items-center justify-center rounded-md border border-slate-200 text-sm font-medium tabular-nums dark:border-slate-700">
                        {index + 1}
                      </span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">
                      Pesquisar produto
                    </Label>
                    <ProductComboboxField
                      value={
                        prod
                          ? {
                              id: prod.id,
                              code: prod.code,
                              technical_code: prod.technical_code,
                              name: prod.name,
                              description: prod.description ?? null,
                              cost_price: prod.cost_price,
                              unit: prod.unit,
                              product_nature: prod.product_nature ?? null,
                              prefix: prod.prefix_code
                                ? { code: prod.prefix_code }
                                : null,
                            }
                          : null
                      }
                      onChange={(hit) => {
                        if (!hit) {
                          updateLineAt(index, {
                            productId: "",
                            usageType: "",
                            costPrice: 0,
                            unitPrice: 0,
                            manualPrice: 0,
                          });
                          return;
                        }
                        const { line: next, product } = lineFromProduct(
                          hit,
                          lines[index]
                        );
                        onProductCacheMerge({ [product.id]: product });
                        updateLineAt(index, next);
                      }}
                      productType="finished"
                      catalogTitle="Pesquisar produto acabado"
                      showNewProductButton
                      commercialQuickCreate
                      sourceQuoteId={sourceQuoteId}
                      placeholder="Digite código ou descrição do acabado…"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1 min-w-0">
                      <Label className="text-xs text-slate-600">Código</Label>
                      <Input
                        readOnly
                        value={prod ? code : ""}
                        placeholder="—"
                        className="h-9 bg-slate-50 font-mono text-sm dark:bg-slate-900/60"
                        title={code}
                      />
                    </div>
                    <div className="space-y-1 min-w-0 sm:col-span-1">
                      <Label className="text-xs text-slate-600">
                        Descrição
                      </Label>
                      <Input
                        readOnly
                        value={prod ? description : ""}
                        placeholder="—"
                        className="h-9 bg-slate-50 text-sm dark:bg-slate-900/60"
                        title={description}
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-red-600 hover:text-red-700"
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
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-9">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Utilização</Label>
                  <select
                    className={SELECT_CLASS}
                    value={line.usageType}
                    onChange={(e) =>
                      updateLineAt(index, {
                        usageType: isItemUsageType(e.target.value)
                          ? e.target.value
                          : "",
                      })
                    }
                    disabled={!line.productId}
                  >
                    <option value="">—</option>
                    {ITEM_USAGE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Qtd.</Label>
                  <NumericInput
                    value={Number.isFinite(line.quantity) ? line.quantity : 0}
                    onChange={(quantity) =>
                      updateLineAt(index, { quantity })
                    }
                    maxDecimals={4}
                    className="h-8 text-sm"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Un.</Label>
                  <Input
                    value={line.unit}
                    onChange={(e) =>
                      updateLineAt(index, { unit: e.target.value })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Custo</Label>
                  <div className="flex h-8 items-center text-sm tabular-nums text-slate-700">
                    {prod ? formatBRL(line.costPrice) : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Forma</Label>
                  <select
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
                    <option value="markup">Markup</option>
                    <option value="manual">Preço fixo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Markup %</Label>
                  {line.priceMode === "markup" ? (
                    <NumericInput
                      value={line.markupPercent}
                      onChange={(markup) =>
                        updateLineAt(index, { markupPercent: markup })
                      }
                      maxDecimals={2}
                      disabled={!line.productId}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <span className="inline-flex h-8 items-center text-xs text-slate-400">
                      —
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Preço un.</Label>
                  {line.priceMode === "manual" ? (
                    <NumericInput
                      value={
                        Number.isFinite(line.manualPrice)
                          ? line.manualPrice
                          : 0
                      }
                      onChange={(manualPrice) =>
                        updateLineAt(index, { manualPrice })
                      }
                      maxDecimals={2}
                      disabled={!line.productId}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <span className="inline-flex h-8 items-center text-sm tabular-nums text-slate-700">
                      {formatBRL(line.unitPrice)}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Desc. (R$)</Label>
                  <NumericInput
                    value={Number.isFinite(line.discount) ? line.discount : 0}
                    onChange={(discount) => {
                      const next = Math.max(
                        0,
                        Math.min(Number(discount) || 0, lineGross)
                      );
                      updateLineAt(index, { discount: next });
                    }}
                    maxDecimals={2}
                    disabled={!line.productId}
                    className="h-8 text-sm"
                    title="Desconto da linha em R$"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Total linha</Label>
                  <div className="flex h-8 items-center text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatBRL(lineTotal)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Textarea
                  value={line.itemNotes}
                  onChange={(e) =>
                    updateLineAt(index, { itemNotes: e.target.value })
                  }
                  rows={2}
                  placeholder="Obs. do item…"
                  className="resize-y min-h-[48px] text-xs"
                />
                <Textarea
                  value={line.clientNotes}
                  onChange={(e) =>
                    updateLineAt(index, { clientNotes: e.target.value })
                  }
                  rows={2}
                  placeholder="Obs. para o cliente (impressão)…"
                  className="resize-y min-h-[48px] text-xs"
                />
              </div>
              {prod ? (
                <label
                  htmlFor={`quote-show-desc-${index}`}
                  className="mt-2 flex items-start gap-2 cursor-pointer"
                >
                  <input
                    id={`quote-show-desc-${index}`}
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
                    checked={line.showProductDescription}
                    onChange={(e) =>
                      updateLineAt(index, {
                        showProductDescription: e.target.checked,
                      })
                    }
                  />
                  <span className="text-[11px] leading-snug text-slate-600">
                    Incluir descrição do produto na impressão
                  </span>
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={addEmptyLine}>
        <Plus className="h-4 w-4" />
        Adicionar produto
      </Button>

      <div className="text-sm text-slate-900 space-y-1">
        <p>
          Subtotal (itens):{" "}
          <span className="font-medium tabular-nums">
            {formatBRL(subtotal)}
          </span>
        </p>
        <p className="text-xs text-slate-500">
          {allowReorder
            ? "Em Seq.: digite a posição (ex.: item 10 → 5 desloca o antigo 5 para 6) ou use ↑/↓. Fora de rascunho a sequência fica bloqueada."
            : "Sequência bloqueada (orçamento já criado/enviado). Reabra como rascunho para alterar a ordem."}
        </p>
      </div>
    </div>
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

    const discount = Number.isFinite(line.discount)
      ? Math.max(0, line.discount)
      : 0;
    const gross = lineTotalPrice(unitPrice, line.quantity);
    if (discount > gross + 1e-9) {
      return { error: "Desconto de item maior que o valor da linha." };
    }

    const item: Record<string, unknown> = {
      product_id: prod.id,
      description: productDisplayLabel(prod),
      quantity: line.quantity,
      unit_price: unitPrice,
      discount,
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

    const itemNotes = line.itemNotes.trim();
    item.item_notes = itemNotes || null;

    item.show_product_description = line.showProductDescription;
    item.usage_type = isItemUsageType(line.usageType) ? line.usageType : null;

    built.push(item);
  }

  if (built.length === 0) {
    return { error: "Adicione pelo menos um produto ao orçamento." };
  }

  return built;
}
