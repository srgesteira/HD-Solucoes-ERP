"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
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

function hitToProduct(hit: ProductSearchHit): QuoteLineProduct {
  return {
    id: hit.id,
    code: hit.code,
    technical_code: hit.technical_code,
    name: hit.name,
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
    discount: 0,
    unit: "UN",
    clientNotes: "",
    itemNotes: "",
    showProductDescription: false,
    usageType: "",
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
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:bg-slate-950 dark:border-slate-600";

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
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onLinesChange(reindexQuoteLines(next));
  };

  /** Move a linha para a posição 1-based indicada (ex.: digitar 3). */
  const moveLineToPosition = (fromIndex: number, rawPosition: number) => {
    if (!Number.isFinite(rawPosition)) return;
    const toIndex = Math.min(
      lines.length - 1,
      Math.max(0, Math.trunc(rawPosition) - 1)
    );
    if (toIndex === fromIndex) return;
    const next = [...lines];
    const [row] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, row);
    onLinesChange(reindexQuoteLines(next));
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm min-w-[1240px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50">
              <th className="px-2 py-2 w-[4.5rem]" title="Ordem na proposta">
                Seq.
              </th>
              <th className="px-2 py-2 min-w-[220px]">Produto</th>
              <th className="px-2 py-2 w-32">Utilização</th>
              <th className="px-2 py-2 w-20">Qtd.</th>
              <th className="px-2 py-2 w-16">Un.</th>
              <th className="px-2 py-2 w-24">Custo</th>
              <th className="px-2 py-2 w-28">Forma</th>
              <th className="px-2 py-2 w-24">Markup %</th>
              <th className="px-2 py-2 w-24">Preço un.</th>
              <th className="px-2 py-2 w-24">Desc. (R$)</th>
              <th className="px-2 py-2 w-24 text-right">Total linha</th>
              <th className="px-2 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
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
              return (
                <tr
                  key={line.key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-1.5 py-2 align-top">
                    <div className="flex items-start gap-0.5">
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
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
                          className="h-6 w-6 p-0"
                          aria-label={`Mover item ${index + 1} para baixo`}
                          title="Descer"
                          disabled={index === lines.length - 1}
                          onClick={() => moveLine(index, 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
                        title="Digite a posição e Enter (ou saia do campo)"
                        className="h-8 w-11 px-1 text-center text-sm tabular-nums"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top min-w-[220px]">
                    <div className="space-y-1.5">
                      <ProductComboboxField
                        compact
                        value={
                          prod
                            ? {
                                id: prod.id,
                                code: prod.code,
                                technical_code: prod.technical_code,
                                name: prod.name,
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
                      {prod ? (
                        <label
                          htmlFor={`quote-show-desc-${index}`}
                          className="flex items-start gap-2 cursor-pointer"
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
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
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
                  </td>
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={Number.isFinite(line.quantity) ? line.quantity : 0}
                      onChange={(quantity) =>
                        updateLineAt(index, { quantity })
                      }
                      maxDecimals={4}
                      className="h-8 text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input
                      value={line.unit}
                      onChange={(e) =>
                        updateLineAt(index, { unit: e.target.value })
                      }
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2 align-top text-right tabular-nums text-slate-700 text-xs">
                    {prod ? formatBRL(line.costPrice) : "—"}
                  </td>
                  <td className="px-2 py-2 align-top">
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
                  </td>
                  <td className="px-2 py-2 align-top">
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
                  </td>
                  <td className="px-2 py-2 align-top">
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
                      <span className="inline-flex h-8 w-full items-center justify-end text-xs tabular-nums text-slate-700">
                        {formatBRL(line.unitPrice)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
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
                  </td>
                  <td className="px-2 py-2 align-top text-right tabular-nums font-medium text-slate-900 text-xs">
                    {formatBRL(lineTotal)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
          Na coluna Seq.: digite o número da posição ou use ↑/↓. A ordem fica
          igual na impressão e no PDF após gravar. Subtotal já considera
          descontos por item.
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
