"use client";

import { Fragment, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NumericInput } from "@/shared/ui/numeric-input";
import { Textarea } from "@/shared/ui/textarea";
import { ProductCatalogPickerModal } from "@/components/products/product-catalog-picker-modal";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import {
  aggregatePurchaseLineTaxes,
  lineDisplayTotal,
  lineSubtotal,
  recalcLineTaxAmounts,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";

import {
  ITEM_USAGE_TYPE_OPTIONS,
  isItemUsageType,
  suggestUsageTypeFromProductNature,
  type ItemUsageType,
} from "@/modules/fiscal/lib/item-usage-type";

export type PurchaseLineProduct = {
  id: string;
  code: string | null;
  technical_code: string | null;
  name: string;
  unit: string | null;
  description?: string | null;
  product_nature?: string | null;
  prefix_code?: string | null;
};

export type PurchaseOrderLineDraft = {
  key: string;
  id?: string;
  productId: string;
  description: string;
  itemNotes: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  icmsRate: number;
  icmsValue: number;
  ipiRate: number;
  ipiValue: number;
  taxBase: number;
  /** Incluir descrição cadastrada do produto na impressão (RFQ). */
  showProductDescription?: boolean;
  usageType?: ItemUsageType | "";
};

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

export function productLabel(p: PurchaseLineProduct): string {
  const sku = productCode(p);
  return sku === "—" ? p.name : `${sku} — ${p.name}`;
}

export function productCode(p: PurchaseLineProduct | undefined): string {
  if (!p) return "—";
  return p.technical_code?.trim() || p.code?.trim() || "—";
}

function hitToProduct(hit: ProductSearchHit): PurchaseLineProduct {
  return {
    id: hit.id,
    code: hit.code,
    technical_code: hit.technical_code,
    name: hit.name,
    unit: hit.unit,
    description: hit.description ?? null,
    product_nature: hit.product_nature ?? null,
    prefix_code: hit.prefix?.code ?? null,
  };
}

function initialLineDescription(hit: ProductSearchHit, p: PurchaseLineProduct): string {
  const desc = hit.description?.trim();
  if (desc) return desc;
  const name = p.name?.trim();
  if (name) return name;
  return productLabel(p);
}

function lineFromProduct(
  hit: ProductSearchHit,
  base?: PurchaseOrderLineDraft
): { line: PurchaseOrderLineDraft; product: PurchaseLineProduct } {
  const p = hitToProduct(hit);
  const line: PurchaseOrderLineDraft = {
    ...(base ?? newPurchaseLine(0)),
    productId: p.id,
    description: initialLineDescription(hit, p),
    unit: (p.unit && p.unit.trim()) || "UN",
    usageType:
      base?.usageType ||
      suggestUsageTypeFromProductNature(p.product_nature, p.prefix_code) ||
      "",
  };
  return { line, product: p };
}

export function newPurchaseLine(index = 0): PurchaseOrderLineDraft {
  return {
    key: `line-${index}`,
    productId: "",
    description: "",
    itemNotes: "",
    quantity: 1,
    unit: "UN",
    unitPrice: 0,
    icmsRate: 0,
    icmsValue: 0,
    ipiRate: 0,
    ipiValue: 0,
    taxBase: 0,
    showProductDescription: false,
    usageType: "",
  };
}

export function reindexPurchaseLines(
  lines: PurchaseOrderLineDraft[]
): PurchaseOrderLineDraft[] {
  return lines.map((line, index) => ({ ...line, key: `line-${index}` }));
}

function withRecalcTaxes(
  line: PurchaseOrderLineDraft,
  patch: Partial<PurchaseOrderLineDraft>,
  taxMode: "icms" | "ipi" | "both" | "none" = "none"
): PurchaseOrderLineDraft {
  const merged = { ...line, ...patch };
  if (taxMode === "none") {
    if (
      patch.ipiValue !== undefined ||
      patch.quantity !== undefined ||
      patch.unitPrice !== undefined
    ) {
      const sub = lineSubtotal(merged.quantity, merged.unitPrice);
      return {
        ...merged,
        taxBase: roundMoney(sub + merged.ipiValue),
      };
    }
    return merged;
  }
  const taxes = recalcLineTaxAmounts(
    merged.quantity,
    merged.unitPrice,
    {
      icmsRate: merged.icmsRate,
      icmsValue: merged.icmsValue,
      ipiRate: merged.ipiRate,
      ipiValue: merged.ipiValue,
      taxBase: merged.taxBase,
    },
    taxMode
  );
  return {
    ...merged,
    icmsValue: taxes.icmsValue,
    ipiValue: taxes.ipiValue,
    taxBase: taxes.taxBase,
  };
}

type Props = {
  lines: PurchaseOrderLineDraft[];
  onLinesChange: (lines: PurchaseOrderLineDraft[]) => void;
  productCache: Record<string, PurchaseLineProduct>;
  onProductCacheMerge: (products: Record<string, PurchaseLineProduct>) => void;
  disabled?: boolean;
  /**
   * `order` — pedido de compra (preços e impostos).
   * `quote` — solicitação de orçamento (sem valores).
   */
  variant?: "order" | "quote";
};

export function PurchaseOrderItemsEditor({
  lines,
  onLinesChange,
  productCache,
  onProductCacheMerge,
  disabled = false,
  variant = "order",
}: Props) {
  const isQuote = variant === "quote";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLineIndex, setPickerLineIndex] = useState<number | null>(null);

  const productById = useMemo(() => {
    const map = new Map<string, PurchaseLineProduct>();
    for (const p of Object.values(productCache)) map.set(p.id, p);
    return map;
  }, [productCache]);

  const totals = useMemo(
    () =>
      aggregatePurchaseLineTaxes(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          icmsValue: l.icmsValue,
          ipiValue: l.ipiValue,
          taxBase: l.taxBase,
        }))
      ),
    [lines]
  );

  const updateLineAt = (
    index: number,
    patch: Partial<PurchaseOrderLineDraft>,
    taxMode: "icms" | "ipi" | "both" | "none" = "none"
  ) => {
    onLinesChange(
      reindexPurchaseLines(
        lines.map((row, i) =>
          i === index ? withRecalcTaxes(row, patch, taxMode) : row
        )
      )
    );
  };

  const removeLineAt = (index: number) => {
    if (disabled || lines.length <= 1) return;
    onLinesChange(
      reindexPurchaseLines(lines.filter((_, i) => i !== index))
    );
  };

  const openProductPicker = (lineIndex: number | null) => {
    if (disabled) return;
    setPickerLineIndex(lineIndex);
    setPickerOpen(true);
  };

  const applySelectedProducts = (hits: ProductSearchHit[]) => {
    if (hits.length === 0) return;

    const cache: Record<string, PurchaseLineProduct> = {};
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
      const { line, product } = lineFromProduct(
        hit,
        newPurchaseLine(nextLines.length)
      );
      cache[product.id] = product;
      nextLines.push(line);
    }

    onProductCacheMerge(cache);
    onLinesChange(reindexPurchaseLines(nextLines));
    setPickerLineIndex(null);
  };

  const usedProductIds = lines
    .map((l) => l.productId)
    .filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50">
              <th className="w-[52px] px-1 py-1.5" aria-label="Acções" />
              <th className={isQuote ? "w-[14%] px-1 py-1.5" : "w-[9%] px-1 py-1.5"}>
                Código
              </th>
              <th className={isQuote ? "w-[40%] px-1 py-1.5" : "w-[20%] px-1 py-1.5"}>
                Descrição
              </th>
              <th className={isQuote ? "w-[14%] px-1 py-1.5" : "w-[10%] px-1 py-1.5"}>
                Utilização
              </th>
              <th className={isQuote ? "w-[12%] px-1 py-1.5" : "w-[8%] px-1 py-1.5"}>
                Qtd.
              </th>
              <th className={isQuote ? "w-[10%] px-1 py-1.5" : "w-[5%] px-1 py-1.5"}>
                Un.
              </th>
              {!isQuote ? (
                <>
                  <th className="w-[9%] px-1 py-1.5">Preço un.</th>
                  <th className="w-[7%] px-1 py-1.5">% ICMS</th>
                  <th className="w-[9%] px-1 py-1.5 text-right">ICMS</th>
                  <th className="w-[7%] px-1 py-1.5">% IPI</th>
                  <th className="w-[9%] px-1 py-1.5 text-right">IPI</th>
                  <th className="w-[10%] px-1 py-1.5 text-right">Total</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const prod = line.productId
                ? productById.get(line.productId)
                : undefined;
              const code = productCode(prod);
              const lineTotal = lineDisplayTotal(
                line.quantity,
                line.unitPrice,
                line.ipiValue
              );
              const unitLocked = Boolean(line.productId);
              const colSpan = isQuote ? 6 : 12;
              return (
                <Fragment key={line.key}>
                <tr
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="px-1 py-1.5 align-top">
                    <div className="flex flex-col gap-0.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title={prod ? "Alterar produto" : "Escolher produto"}
                        aria-label={
                          prod
                            ? `Alterar produto da linha ${index + 1}`
                            : `Escolher produto da linha ${index + 1}`
                        }
                        onClick={() => openProductPicker(index)}
                        disabled={disabled}
                      >
                        <Search className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40"
                        title="Excluir linha"
                        aria-label={`Excluir item ${index + 1}`}
                        onClick={() => removeLineAt(index)}
                        disabled={disabled || lines.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td
                    className="px-1 py-1.5 align-top font-mono text-[11px] text-slate-800 truncate"
                    title={code}
                  >
                    {code}
                  </td>
                  <td className="px-1 py-1.5 align-top">
                    <div className="space-y-1">
                      <Input
                        value={line.description}
                        onChange={(e) =>
                          updateLineAt(index, { description: e.target.value })
                        }
                        disabled={disabled}
                        className="h-7 text-xs px-2"
                        placeholder="Nome do item…"
                      />
                      <Textarea
                        value={line.itemNotes}
                        onChange={(e) =>
                          updateLineAt(index, { itemNotes: e.target.value })
                        }
                        disabled={disabled}
                        rows={2}
                        placeholder="Obs. do item…"
                        className="resize-y min-h-[44px] text-[11px] px-2 py-1"
                      />
                    </div>
                  </td>
                  <td className="px-1 py-1.5 align-top">
                    <select
                      className="h-7 w-full rounded-md border border-slate-300 bg-white px-1 text-[11px] dark:bg-slate-950 dark:border-slate-600"
                      value={line.usageType ?? ""}
                      onChange={(e) =>
                        updateLineAt(index, {
                          usageType: isItemUsageType(e.target.value)
                            ? e.target.value
                            : "",
                        })
                      }
                      disabled={disabled}
                    >
                      <option value="">—</option>
                      {ITEM_USAGE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1.5 align-top">
                    <NumericInput
                      value={line.quantity}
                      onChange={(quantity) =>
                        updateLineAt(
                          index,
                          { quantity },
                          isQuote ? "none" : "both"
                        )
                      }
                      maxDecimals={4}
                      disabled={disabled}
                      className="h-7 text-xs px-2"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-1 py-1.5 align-top">
                    {unitLocked ? (
                      <span
                        className="inline-flex h-7 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/40"
                        title="Unidade definida no cadastro do produto"
                      >
                        {line.unit || "UN"}
                      </span>
                    ) : (
                      <Input
                        value={line.unit}
                        onChange={(e) =>
                          updateLineAt(index, { unit: e.target.value })
                        }
                        disabled={disabled}
                        className="h-7 text-xs px-2"
                      />
                    )}
                  </td>
                  {!isQuote ? (
                    <>
                      <td className="px-1 py-1.5 align-top">
                        <NumericInput
                          value={line.unitPrice}
                          onChange={(unitPrice) =>
                            updateLineAt(index, { unitPrice }, "both")
                          }
                          maxDecimals={2}
                          disabled={disabled}
                          className="h-7 text-xs px-2"
                        />
                      </td>
                      <td className="px-1 py-1.5 align-top">
                        <NumericInput
                          value={line.icmsRate}
                          onChange={(icmsRate) =>
                            updateLineAt(index, { icmsRate }, "icms")
                          }
                          maxDecimals={2}
                          disabled={disabled}
                          className="h-7 text-xs px-2"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-1 py-1.5 align-top text-right tabular-nums text-slate-700 bg-slate-50/80 dark:bg-slate-900/30">
                        <span className="inline-flex h-7 w-full items-center justify-end px-1 text-[11px]">
                          {formatBRL(line.icmsValue)}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 align-top">
                        <NumericInput
                          value={line.ipiRate}
                          onChange={(ipiRate) =>
                            updateLineAt(index, { ipiRate }, "ipi")
                          }
                          maxDecimals={2}
                          disabled={disabled}
                          className="h-7 text-xs px-2"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-1 py-1.5 align-top text-right tabular-nums text-slate-700 bg-slate-50/80 dark:bg-slate-900/30">
                        <span className="inline-flex h-7 w-full items-center justify-end px-1 text-[11px]">
                          {formatBRL(line.ipiValue)}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 align-top text-right tabular-nums font-medium text-slate-900 text-[11px]">
                        {formatBRL(lineTotal)}
                      </td>
                    </>
                  ) : null}
                </tr>
                {isQuote && prod ? (
                  <tr className="border-b border-slate-100 last:border-0 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/30">
                    <td colSpan={colSpan} className="px-3 py-2">
                      <label
                        htmlFor={`poi-show-desc-${index}`}
                        className="flex items-start gap-3 cursor-pointer"
                      >
                        <input
                          id={`poi-show-desc-${index}`}
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
                          checked={Boolean(line.showProductDescription)}
                          disabled={disabled}
                          onChange={(e) =>
                            updateLineAt(index, {
                              showProductDescription: e.target.checked,
                            })
                          }
                        />
                        <span className="space-y-0.5">
                          <span className="block text-xs font-medium text-slate-900 dark:text-slate-100">
                            Incluir descrição do produto na impressão
                          </span>
                          <span className="block text-[11px] text-slate-500 leading-relaxed">
                            Mostra a descrição técnica cadastrada no produto no
                            PDF/impressão desta linha.
                          </span>
                        </span>
                      </label>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        <strong>Código</strong> — SKU do cadastro (só leitura).{" "}
        <strong>Descrição</strong> — texto do item nesta solicitação (editável).
        {isQuote
          ? " Sem valores — a cotação virá da resposta do fornecedor."
          : " Unidade, ICMS (R$) e IPI (R$) são calculados ou vêm do produto."}
      </p>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const firstEmpty = lines.findIndex((l) => !l.productId);
          openProductPicker(firstEmpty >= 0 ? firstEmpty : null);
        }}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Adicionar produto
      </Button>

      {!isQuote ? (
        <div className="text-sm text-slate-900 space-y-1">
          <p>
            Subtotal (itens):{" "}
            <span className="font-medium tabular-nums">
              {formatBRL(totals.subtotal)}
            </span>
          </p>
          <p>
            Total ICMS:{" "}
            <span className="font-medium tabular-nums">
              {formatBRL(totals.totalIcms)}
            </span>
          </p>
          <p>
            Total IPI:{" "}
            <span className="font-medium tabular-nums">
              {formatBRL(totals.totalIpi)}
            </span>
          </p>
          <p>
            Base de cálculo (soma):{" "}
            <span className="font-medium tabular-nums">
              {formatBRL(totals.totalTaxBase)}
            </span>
          </p>
        </div>
      ) : null}

      <ProductCatalogPickerModal
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerLineIndex(null);
        }}
        excludeIds={usedProductIds}
        multiSelect
        onComplete={applySelectedProducts}
        productType="all"
        showNewProductButton={false}
        title="Pesquisar produto"
      />
    </div>
  );
}

export function buildPurchaseOrderItemsPayload(
  lines: PurchaseOrderLineDraft[]
): Array<Record<string, unknown>> | { error: string } {
  const built: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    if (!line.productId.trim() && !line.description.trim()) continue;
    if (!line.description.trim()) {
      return { error: "Preencha a descrição de todos os itens." };
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { error: "Quantidade inválida num item." };
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      return { error: "Preço unitário inválido num item." };
    }

    const item: Record<string, unknown> = {
      product_id: line.productId.trim() || null,
      description: line.description.trim(),
      quantity: line.quantity,
      unit_price: line.unitPrice,
      unit: line.unit.trim() || "UN",
      icms_rate: line.icmsRate,
      icms_value: line.icmsValue,
      ipi_rate: line.ipiRate,
      ipi_value: line.ipiValue,
      tax_base: roundMoney(lineSubtotal(line.quantity, line.unitPrice) + line.ipiValue),
    };
    if (line.id) item.id = line.id;
    item.usage_type = isItemUsageType(line.usageType) ? line.usageType : null;
    item.item_notes = line.itemNotes.trim() || null;
    built.push(item);
  }

  if (built.length === 0) {
    return { error: "Adicione pelo menos um item ao pedido." };
  }

  return built;
}

/** Payload de itens para solicitação de orçamento (sem preços). */
export function buildQuoteRequestItemsPayload(
  lines: PurchaseOrderLineDraft[]
): Array<{
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  show_product_description: boolean;
  usage_type: "consumo" | "materia_prima" | "revenda" | null;
}> | { error: string } {
  const built: Array<{
    id?: string;
    product_id: string | null;
    description: string;
    quantity: number;
    unit: string;
    show_product_description: boolean;
    usage_type: "consumo" | "materia_prima" | "revenda" | null;
  }> = [];

  for (const line of lines) {
    if (!line.productId.trim() && !line.description.trim()) continue;
    if (!line.description.trim()) {
      return { error: "Preencha a descrição de todos os itens." };
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { error: "Quantidade inválida num item." };
    }
    const item: {
      id?: string;
      product_id: string | null;
      description: string;
      quantity: number;
      unit: string;
      show_product_description: boolean;
      usage_type: "consumo" | "materia_prima" | "revenda" | null;
    } = {
      product_id: line.productId.trim() || null,
      description: line.description.trim(),
      quantity: line.quantity,
      unit: line.unit.trim() || "UN",
      show_product_description: Boolean(line.showProductDescription),
      usage_type: isItemUsageType(line.usageType) ? line.usageType : null,
    };
    if (line.id) item.id = line.id;
    built.push(item);
  }

  if (built.length === 0) {
    return { error: "Adicione pelo menos um item à solicitação." };
  }

  return built;
}
