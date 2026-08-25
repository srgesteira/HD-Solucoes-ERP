"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NumericInput } from "@/shared/ui/numeric-input";
import { Textarea } from "@/shared/ui/textarea";
import { ProductComboboxField } from "@/components/products/product-combobox-field";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import {
  aggregatePurchaseLineTaxes,
  lineDisplayTotal,
  lineNetSubtotal,
  lineSubtotal,
  recalcLineTaxAmounts,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";

import {
  canEditLineTaxes,
  isFieldReadonly,
} from "@/shared/auth/field-permissions";
import {
  ITEM_USAGE_TYPE_OPTIONS,
  isItemUsageType,
  suggestUsageTypeFromProductNature,
  type ItemUsageType,
} from "@/modules/fiscal/lib/item-usage-type";

const taxReadonlyOnOrder = isFieldReadonly(
  "purchase_order_items",
  "compras",
  "icms_rate"
);
const taxesLocked = !canEditLineTaxes("purchase_order_items", "compras");

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
  discount: number;
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
    discount: 0,
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
      patch.unitPrice !== undefined ||
      patch.discount !== undefined
    ) {
      const sub = lineNetSubtotal(
        merged.quantity,
        merged.unitPrice,
        merged.discount
      );
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
    taxMode,
    merged.discount
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
          discount: l.discount,
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

  const addEmptyLine = () => {
    if (disabled) return;
    onLinesChange(
      reindexPurchaseLines([...lines, newPurchaseLine(lines.length)])
    );
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table
          className={
            isQuote ? "w-full text-sm min-w-[720px]" : "w-full text-sm min-w-[1180px]"
          }
        >
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50">
              <th className="px-2 py-2 min-w-[220px]">Produto</th>
              <th className="px-2 py-2 w-32">Utilização</th>
              <th className="px-2 py-2 w-20">Qtd.</th>
              <th className="px-2 py-2 w-16">Un.</th>
              {!isQuote ? (
                <>
                  <th className="px-2 py-2 w-24">Preço un.</th>
                  <th className="px-2 py-2 w-24">Desc. (R$)</th>
                  <th className="px-2 py-2 w-20">% ICMS</th>
                  <th className="px-2 py-2 w-24">ICMS (R$)</th>
                  <th className="px-2 py-2 w-20">% IPI</th>
                  <th className="px-2 py-2 w-24">IPI (R$)</th>
                  <th className="px-2 py-2 w-28">Base cálculo</th>
                  <th className="px-2 py-2 w-24 text-right">Total linha</th>
                </>
              ) : null}
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const prod = line.productId
                ? productById.get(line.productId)
                : undefined;
              const lineSub = lineNetSubtotal(
                line.quantity,
                line.unitPrice,
                line.discount
              );
              const lineTotal = lineDisplayTotal(
                line.quantity,
                line.unitPrice,
                line.ipiValue,
                line.discount
              );
              const unitLocked = Boolean(line.productId);
              return (
                <tr
                  key={line.key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
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
                                description: prod.description ?? null,
                                cost_price: 0,
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
                              description: "",
                              usageType: "",
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
                        productType="all"
                        disabled={disabled}
                        catalogTitle="Pesquisar produto"
                      />
                      <Input
                        value={line.description}
                        onChange={(e) =>
                          updateLineAt(index, { description: e.target.value })
                        }
                        disabled={disabled}
                        className="h-8 text-sm"
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
                        className="resize-y min-h-[48px] text-xs"
                        title="Texto impresso no pedido de compra sob o produto"
                      />
                      {isQuote && prod ? (
                        <label
                          htmlFor={`poi-show-desc-${index}`}
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <input
                            id={`poi-show-desc-${index}`}
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
                            checked={Boolean(line.showProductDescription)}
                            disabled={disabled}
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
                      className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:bg-slate-950 dark:border-slate-600"
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
                  <td className="px-2 py-2 align-top">
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
                      className="h-8 text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    {unitLocked ? (
                      <span
                        className="inline-flex h-8 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40"
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
                        className="h-8 text-sm"
                      />
                    )}
                  </td>
                  {!isQuote ? (
                    <>
                      <td className="px-2 py-2 align-top">
                        <NumericInput
                          value={line.unitPrice}
                          onChange={(unitPrice) =>
                            updateLineAt(index, { unitPrice }, "both")
                          }
                          maxDecimals={3}
                          disabled={disabled}
                          className="h-8 text-sm"
                          title="Preço unitário (até 3 casas — milheiro)"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <NumericInput
                          value={line.discount}
                          onChange={(discount) => {
                            const gross = lineSubtotal(
                              line.quantity,
                              line.unitPrice
                            );
                            const next = Math.max(
                              0,
                              Math.min(Number(discount) || 0, gross)
                            );
                            updateLineAt(index, { discount: next }, "both");
                          }}
                          maxDecimals={2}
                          disabled={disabled}
                          className="h-8 text-sm"
                          title="Desconto da linha em R$"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <NumericInput
                          value={line.icmsRate}
                          onChange={(icmsRate) =>
                            updateLineAt(index, { icmsRate }, "icms")
                          }
                          maxDecimals={2}
                          disabled={disabled || taxReadonlyOnOrder || taxesLocked}
                          readOnly={taxReadonlyOnOrder || taxesLocked}
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
                          disabled={disabled || taxReadonlyOnOrder || taxesLocked}
                          readOnly={taxReadonlyOnOrder || taxesLocked}
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
                          disabled={disabled || taxReadonlyOnOrder || taxesLocked}
                          readOnly={taxReadonlyOnOrder || taxesLocked}
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
                          disabled={disabled || taxReadonlyOnOrder || taxesLocked}
                          readOnly={taxReadonlyOnOrder || taxesLocked}
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 align-top text-right tabular-nums text-slate-700 text-xs">
                        {formatBRL(
                          line.taxBase || roundMoney(lineSub + line.ipiValue)
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-right tabular-nums font-medium text-slate-900 text-xs">
                        {formatBRL(lineTotal)}
                      </td>
                    </>
                  ) : null}
                  <td className="px-2 py-2 align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      aria-label={`Remover item ${index + 1}`}
                      onClick={() => removeLineAt(index)}
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
        onClick={addEmptyLine}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Adicionar produto
      </Button>

      {isQuote ? (
        <p className="text-xs text-slate-500">
          Sem valores nesta etapa — a cotação virá da resposta do fornecedor.
        </p>
      ) : (
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
      )}
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
    const discount = Number.isFinite(line.discount)
      ? Math.max(0, line.discount)
      : 0;
    const gross = lineSubtotal(line.quantity, line.unitPrice);
    if (discount > gross + 1e-9) {
      return { error: "Desconto de item maior que o valor da linha." };
    }
    const net = lineNetSubtotal(line.quantity, line.unitPrice, discount);

    const item: Record<string, unknown> = {
      product_id: line.productId.trim() || null,
      description: line.description.trim(),
      quantity: line.quantity,
      unit_price: line.unitPrice,
      discount,
      unit: line.unit.trim() || "UN",
      icms_rate: line.icmsRate,
      icms_value: line.icmsValue,
      ipi_rate: line.ipiRate,
      ipi_value: line.ipiValue,
      tax_base: roundMoney(net + line.ipiValue),
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
