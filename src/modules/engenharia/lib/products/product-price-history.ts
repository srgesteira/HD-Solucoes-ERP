import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

export const PRODUCT_PRICE_TYPES = [
  "purchase",
  "production_cost",
  "sale",
] as const;

export type ProductPriceType = (typeof PRODUCT_PRICE_TYPES)[number];

export type ProductPriceHistoryRow = {
  id: string;
  product_id: string;
  price_type: ProductPriceType;
  value: number;
  quote_date: string;
  position: number;
  tax_deduction_percent: number | null;
  notes: string | null;
  created_at: string;
};

type Admin = SupabaseClient<Database>;

export type RecordPriceHistoryInput = {
  priceType: ProductPriceType;
  value: number;
  quoteDate?: string;
  taxDeductionPercent?: number;
  notes?: string | null;
  /** Se false, não altera products.cost_price (apenas histórico). */
  syncCostPrice?: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Desloca posições 1..5 → 2..6 e remove a posição 6 anterior. */
async function shiftPriceHistoryPositions(
  admin: Admin,
  tenantId: string,
  productId: string,
  priceType: ProductPriceType
): Promise<void> {
  const { data: existing, error } = await admin
    .from("product_price_history")
    .select("id, position")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("price_type", priceType)
    .order("position", { ascending: false });

  if (error) throw new Error(error.message);

  for (const row of existing ?? []) {
    const pos = Number(row.position);
    if (pos >= 6) {
      await admin.from("product_price_history").delete().eq("id", row.id);
    } else if (pos >= 1) {
      await admin
        .from("product_price_history")
        .update({ position: pos + 1 })
        .eq("id", row.id);
    }
  }
}

async function hasPurchaseHistory(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<boolean> {
  const { count, error } = await admin
    .from("product_price_history")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("price_type", "purchase");

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * Regista valor na posição 1 e desloca histórico anterior (máx. 6 entradas).
 * Atualiza products.cost_price conforme o tipo.
 */
export async function recordProductPriceHistory(
  admin: Admin,
  tenantId: string,
  productId: string,
  input: RecordPriceHistoryInput
): Promise<void> {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Valor de histórico inválido.");
  }

  await shiftPriceHistoryPositions(
    admin,
    tenantId,
    productId,
    input.priceType
  );

  const { error: insErr } = await admin.from("product_price_history").insert({
    tenant_id: tenantId,
    product_id: productId,
    price_type: input.priceType,
    value,
    quote_date: input.quoteDate ?? todayIsoDate(),
    position: 1,
    tax_deduction_percent: input.taxDeductionPercent ?? 0,
    notes: input.notes ?? null,
  });

  if (insErr) throw new Error(insErr.message);

  const sync = input.syncCostPrice !== false;
  if (!sync) return;

  let shouldUpdateCost = false;
  if (input.priceType === "purchase") {
    shouldUpdateCost = true;
  } else if (input.priceType === "production_cost") {
    const hasPurchase = await hasPurchaseHistory(admin, tenantId, productId);
    shouldUpdateCost = !hasPurchase;
  }

  if (shouldUpdateCost) {
    const { error: upErr } = await admin
      .from("products")
      .update({ cost_price: value })
      .eq("id", productId)
      .eq("tenant_id", tenantId);
    if (upErr) throw new Error(upErr.message);
  }
}

export async function listProductPriceHistory(
  admin: Admin,
  tenantId: string,
  productId: string,
  priceType?: ProductPriceType
): Promise<ProductPriceHistoryRow[]> {
  let q = admin
    .from("product_price_history")
    .select(
      "id, product_id, price_type, value, quote_date, position, tax_deduction_percent, notes, created_at"
    )
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .order("price_type", { ascending: true })
    .order("position", { ascending: true });

  if (priceType) {
    q = q.eq("price_type", priceType);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    product_id: r.product_id,
    price_type: r.price_type as ProductPriceType,
    value: Number(r.value),
    quote_date: String(r.quote_date),
    position: Number(r.position),
    tax_deduction_percent:
      r.tax_deduction_percent != null ? Number(r.tax_deduction_percent) : null,
    notes: r.notes,
    created_at: r.created_at,
  }));
}

/** Agrupa histórico por price_type (até 6 posições cada). */
export function groupPriceHistoryByType(
  rows: ProductPriceHistoryRow[]
): Record<ProductPriceType, ProductPriceHistoryRow[]> {
  const out: Record<ProductPriceType, ProductPriceHistoryRow[]> = {
    purchase: [],
    production_cost: [],
    sale: [],
  };
  for (const r of rows) {
    if (out[r.price_type]) out[r.price_type].push(r);
  }
  return out;
}

export type UnifiedCostHistorySlot = {
  position: number;
  value: number | null;
  quote_date: string | null;
  price_type: ProductPriceType | null;
  tax_deduction_percent: number | null;
  value_after_deduction: number | null;
};

const COST_HISTORY_TYPES: ProductPriceType[] = ["purchase", "production_cost"];

export function priceTypeLabel(type: ProductPriceType | null): string {
  if (type === "purchase") return "Compra";
  if (type === "production_cost") return "Produção";
  if (type === "sale") return "Venda";
  return "—";
}

/** Vista unificada de custo (compra + produção) em 6 posições para a UI. */
export function buildUnifiedCostHistorySlots(
  rows: ProductPriceHistoryRow[]
): UnifiedCostHistorySlot[] {
  const relevant = rows
    .filter((r) => COST_HISTORY_TYPES.includes(r.price_type))
    .sort((a, b) => {
      const da = `${a.quote_date}T${a.created_at}`;
      const db = `${b.quote_date}T${b.created_at}`;
      return db.localeCompare(da);
    });

  const latest = relevant[0] ?? null;
  const latestTax = latest?.tax_deduction_percent ?? null;
  const baseForDeduction = latest?.value ?? null;

  const slots: UnifiedCostHistorySlot[] = [];
  for (let i = 1; i <= 6; i++) {
    const row = relevant[i - 1];
    const value = row ? row.value : null;

    let taxPct: number | null = null;
    let afterDeduction: number | null = null;
    if (i === 6) {
      taxPct = latestTax;
      if (
        baseForDeduction != null &&
        taxPct != null &&
        Number.isFinite(Number(taxPct))
      ) {
        afterDeduction =
          Math.round(
            baseForDeduction * (1 - Number(taxPct) / 100) * 10000
          ) / 10000;
      }
    }

    slots.push({
      position: i,
      value: i === 6 && value == null && baseForDeduction != null
        ? baseForDeduction
        : value,
      quote_date: row?.quote_date ?? (i === 6 ? latest?.quote_date ?? null : null),
      price_type: row?.price_type ?? (i === 6 ? latest?.price_type ?? null : null),
      tax_deduction_percent: i === 6 ? taxPct : null,
      value_after_deduction: i === 6 ? afterDeduction : null,
    });
  }

  return slots;
}

export function hasAnyCostHistory(rows: ProductPriceHistoryRow[]): boolean {
  return rows.some((r) => COST_HISTORY_TYPES.includes(r.price_type));
}
