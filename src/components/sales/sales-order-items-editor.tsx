"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NumericInput } from "@/shared/ui/numeric-input";
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

export type SalesOrderLineProduct = {
  id: string;
  code: string | null;
  technical_code: string | null;
  name: string;
  unit: string | null;
  product_nature?: string | null;
  prefix_code?: string | null;
};

export type SalesOrderLineDraft = {
  key: string;
  id?: string;
  productId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  icmsRate: number;
  icmsValue: number;
  ipiRate: number;
  ipiValue: number;
  taxBase: number;
  usageType: ItemUsageType | "";
};

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

export function productLabel(p: SalesOrderLineProduct): string {
  const sku = p.technical_code?.trim() || p.code?.trim() || "—";
  return `${sku} — ${p.name}`;
}

function hitToProduct(hit: ProductSearchHit): SalesOrderLineProduct {
  return {
    id: hit.id,
    code: hit.code,
    technical_code: hit.technical_code,
    name: hit.name,
    unit: hit.unit,
    product_nature: hit.product_nature ?? null,
    prefix_code: hit.prefix?.code ?? null,
  };
}

function lineFromProduct(
  hit: ProductSearchHit,
  base?: SalesOrderLineDraft
): { line: SalesOrderLineDraft; product: SalesOrderLineProduct } {
  const p = hitToProduct(hit);
  const label = productLabel(p);
  const line: SalesOrderLineDraft = {
    ...(base ?? newSalesOrderLine(0)),
    productId: p.id,
    description: label,
    unit: (p.unit && p.unit.trim()) || "UN",
    usageType:
      base?.usageType ||
      suggestUsageTypeFromProductNature(p.product_nature, p.prefix_code) ||
      "",
  };
  return { line, product: p };
}

export function newSalesOrderLine(index = 0): SalesOrderLineDraft {
  return {
    key: `line-${index}`,
    productId: "",
    description: "",
    quantity: 1,
    unit: "UN",
    unitPrice: 0,
    icmsRate: 0,
    icmsValue: 0,
    ipiRate: 0,
    ipiValue: 0,
    taxBase: 0,
    usageType: "",
  };
}

export function reindexSalesOrderLines(
  lines: SalesOrderLineDraft[]
): SalesOrderLineDraft[] {
  return lines.map((line, index) => ({ ...line, key: `line-${index}` }));
}

function withRecalcTaxes(
  line: SalesOrderLineDraft,
  patch: Partial<SalesOrderLineDraft>,
  taxMode: "icms" | "ipi" | "both" | "none" = "none"
): SalesOrderLineDraft {
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
  lines: SalesOrderLineDraft[];
  onLinesChange: (lines: SalesOrderLineDraft[]) => void;
  productCache: Record<string, SalesOrderLineProduct>;
  onProductCacheMerge: (products: Record<string, SalesOrderLineProduct>) => void;
  disabled?: boolean;
};

export function SalesOrderItemsEditor({
  lines,
  onLinesChange,
  productCache,
  onProductCacheMerge,
  disabled = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLineIndex, setPickerLineIndex] = useState<number | null>(null);

  const productById = useMemo(() => {
    const map = new Map<string, SalesOrderLineProduct>();
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
    patch: Partial<SalesOrderLineDraft>,
    taxMode: "icms" | "ipi" | "both" | "none" = "none"
  ) => {
    onLinesChange(
      reindexSalesOrderLines(
        lines.map((row, i) =>
          i === index ? withRecalcTaxes(row, patch, taxMode) : row
        )
      )
    );
  };

  const openProductPicker = (lineIndex: number | null) => {
    if (disabled) return;
    setPickerLineIndex(lineIndex);
    setPickerOpen(true);
  };

  const applySelectedProducts = (hits: ProductSearchHit[]) => {
    if (hits.length === 0) return;

    const cache: Record<string, SalesOrderLineProduct> = {};
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
        newSalesOrderLine(nextLines.length)
      );
      cache[product.id] = product;
      nextLines.push(line);
    }

    onProductCacheMerge(cache);
    onLinesChange(reindexSalesOrderLines(nextLines));
    setPickerLineIndex(null);
  };

  const usedProductIds = lines
    .map((l) => l.productId)
    .filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm min-w-[1280px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50">
              <th className="px-2 py-2 min-w-[140px]">Produto</th>
              <th className="px-2 py-2 min-w-[120px]">Descrição</th>
              <th className="px-2 py-2 w-32">Utilização</th>
              <th className="px-2 py-2 w-20">Qtd.</th>
              <th className="px-2 py-2 w-16">Un.</th>
              <th className="px-2 py-2 w-24">Preço un.</th>
              <th className="px-2 py-2 w-20">% ICMS</th>
              <th className="px-2 py-2 w-24">ICMS (R$)</th>
              <th className="px-2 py-2 w-20">% IPI</th>
              <th className="px-2 py-2 w-24">IPI (R$)</th>
              <th className="px-2 py-2 w-28">Base cálculo</th>
              <th className="px-2 py-2 w-24 text-right">Total linha</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const prod = line.productId
                ? productById.get(line.productId)
                : undefined;
              const lineSub = lineSubtotal(line.quantity, line.unitPrice);
              const lineTotal = lineDisplayTotal(
                line.quantity,
                line.unitPrice,
                line.ipiValue
              );
              return (
                <tr
                  key={line.key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-2 py-2 align-top">
                    {prod ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-800 line-clamp-2 text-xs">
                          {productLabel(prod)}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit h-7 text-xs"
                          onClick={() => openProductPicker(index)}
                          disabled={disabled}
                        >
                          <Search className="h-3 w-3" />
                          Alterar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openProductPicker(index)}
                        disabled={disabled}
                      >
                        <Search className="h-3.5 w-3.5" />
                        Produto
                      </Button>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Input
                      value={line.description}
                      onChange={(e) =>
                        updateLineAt(index, { description: e.target.value })
                      }
                      disabled={disabled}
                      className="h-8 text-sm"
                      placeholder="Descrição…"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <select
                      className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:bg-slate-950 dark:border-slate-600"
                      value={line.usageType}
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
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={line.quantity}
                      onChange={(quantity) =>
                        updateLineAt(index, { quantity }, "both")
                      }
                      maxDecimals={4}
                      disabled={disabled}
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
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={line.unitPrice}
                      onChange={(unitPrice) =>
                        updateLineAt(index, { unitPrice }, "both")
                      }
                      maxDecimals={2}
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={line.icmsRate}
                      onChange={(icmsRate) =>
                        updateLineAt(index, { icmsRate }, "icms")
                      }
                      maxDecimals={2}
                      disabled={disabled}
                      className="h-8 text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={line.icmsValue}
                      onChange={(icmsValue) =>
                        updateLineAt(index, { icmsValue }, "none")
                      }
                      maxDecimals={2}
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={line.ipiRate}
                      onChange={(ipiRate) =>
                        updateLineAt(index, { ipiRate }, "ipi")
                      }
                      maxDecimals={2}
                      disabled={disabled}
                      className="h-8 text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <NumericInput
                      value={line.ipiValue}
                      onChange={(ipiValue) =>
                        updateLineAt(index, { ipiValue }, "none")
                      }
                      maxDecimals={2}
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2 align-top text-right tabular-nums text-slate-700 text-xs">
                    {formatBRL(line.taxBase || roundMoney(lineSub + line.ipiValue))}
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
                            : reindexSalesOrderLines(
                                lines.filter((_, i) => i !== index)
                              )
                        )
                      }
                      disabled={disabled || lines.length <= 1}
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

export function buildSalesOrderItemsPayload(
  lines: SalesOrderLineDraft[]
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
      usage_type: isItemUsageType(line.usageType) ? line.usageType : null,
    };
    if (line.id) item.id = line.id;
    built.push(item);
  }

  if (built.length === 0) {
    return { error: "Adicione pelo menos um item ao pedido." };
  }

  return built;
}
