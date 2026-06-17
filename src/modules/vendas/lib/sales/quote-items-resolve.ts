import type { AdminClient } from "@/modules/vendas/lib/sales/sales-flow";
import type { SaleLineInput } from "@/modules/vendas/lib/sales/sales-flow";
import {
  DEFAULT_QUOTE_MARKUP_PERCENT,
  parseMarkupPercent,
  parseUnitPrice,
  payloadUsesMarkupPercent,
  unitPriceFromCostAndMarkup,
} from "@/modules/vendas/lib/sales/quote-line-pricing";
import { isCompleteClassificationSuffix } from "@/modules/engenharia/lib/products/prefix-classification";

type ProductRow = {
  id: string;
  name: string;
  type: string;
  cost_price: number;
  unit: string | null;
  technical_code: string | null;
  code: string | null;
  product_nature: string | null;
  hvac_filter_class: string | null;
  hvac_airflow_m3h: number | null;
  hvac_cleanroom_class: string | null;
};

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value.replace(",", "."))
        : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseOptionalHvacClass(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function hvacFromProduct(p: ProductRow) {
  return {
    hvac_filter_class: p.hvac_filter_class?.trim() || null,
    hvac_airflow_m3h:
      p.hvac_airflow_m3h != null ? Number(p.hvac_airflow_m3h) : null,
    hvac_cleanroom_class: p.hvac_cleanroom_class?.trim() || null,
  };
}

function productLabel(p: ProductRow): string {
  const sku = p.technical_code?.trim() || p.code?.trim() || "—";
  return `${sku} — ${p.name}`;
}

/** Garante que todos os produtos existem e são acabados (`type = finished`). */
export async function assertFinishedProducts(
  admin: AdminClient,
  tenantId: string,
  productIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(productIds.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, message: "Adicione pelo menos um produto acabado." };
  }

  const { data, error } = await admin
    .from("products")
    .select("id, type, prefix:product_prefixes!products_prefix_id_fkey(code)")
    .eq("tenant_id", tenantId)
    .in("id", unique);

  if (error) {
    return { ok: false, message: "Erro ao validar produtos: " + error.message };
  }

  for (const id of unique) {
    const row = (data ?? []).find((p) => p.id === id);
    if (!row) {
      return { ok: false, message: "Produto inválido: " + id };
    }
    const prefixRaw = row.prefix as
      | { code?: string | null }
      | { code?: string | null }[]
      | null;
    const prefixCode = Array.isArray(prefixRaw)
      ? prefixRaw[0]?.code
      : prefixRaw?.code;
    const isFinished =
      row.type === "finished" ||
      isCompleteClassificationSuffix(prefixCode ?? "");
    if (!isFinished) {
      return {
        ok: false,
        message:
          "Apenas produtos acabados (HD1, HD2, HD3, AC) são permitidos no orçamento.",
      };
    }
  }

  return { ok: true };
}

/**
 * Converte payload `items` em linhas.
 * Com `markup_percent`: recalcula `unit_price` a partir do custo.
 * Sem `markup_percent`: usa `unit_price` enviado (preço manual).
 */
export async function resolveQuoteItemsFromPayload(
  admin: AdminClient,
  tenantId: string,
  rawItems: unknown
): Promise<
  | { ok: true; lines: SaleLineInput[] }
  | { ok: false; message: string }
> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, message: "Adicione pelo menos um item ao orçamento." };
  }

  const productIds: string[] = [];
  const drafts: Array<{
    product_id: string;
    quantity: number;
    unit?: string;
    description?: string;
    client_notes?: string | null;
    show_product_description?: boolean;
    unit_price: number | null;
    markup_percent: number | null;
    use_markup: boolean;
    hvac_filter_class: string | null;
    hvac_airflow_m3h: number | null;
    hvac_cleanroom_class: string | null;
  }> = [];

  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i];
    if (!row || typeof row !== "object") {
      return { ok: false, message: `Item ${i + 1}: formato inválido` };
    }
    const r = row as Record<string, unknown>;

    const product_id =
      typeof r.product_id === "string" ? r.product_id.trim() : "";
    if (!product_id) {
      return { ok: false, message: `Item ${i + 1}: produto é obrigatório` };
    }

    const qtyRaw = r.quantity;
    const quantity =
      typeof qtyRaw === "number"
        ? qtyRaw
        : typeof qtyRaw === "string"
          ? parseFloat(qtyRaw.replace(",", "."))
          : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: `Item ${i + 1}: quantidade inválida` };
    }

    const use_markup = payloadUsesMarkupPercent(r.markup_percent);
    const unit_price = parseUnitPrice(r.unit_price);
    const markup_percent = use_markup
      ? parseMarkupPercent(r.markup_percent, DEFAULT_QUOTE_MARKUP_PERCENT)
      : null;

    if (!use_markup && unit_price === null) {
      return {
        ok: false,
        message: `Item ${i + 1}: preço unitário é obrigatório`,
      };
    }

    const unit =
      r.unit !== undefined && r.unit !== null && String(r.unit).trim()
        ? String(r.unit).trim()
        : "UN";

    const description =
      typeof r.description === "string" ? r.description.trim() : "";
    const client_notes =
      typeof r.client_notes === "string" && r.client_notes.trim()
        ? r.client_notes.trim()
        : null;
    const show_product_description = r.show_product_description === true;
    const hvac_filter_class = parseOptionalHvacClass(r.hvac_filter_class);
    const hvac_airflow_m3h = parseOptionalNumber(r.hvac_airflow_m3h);
    const hvac_cleanroom_class = parseOptionalHvacClass(r.hvac_cleanroom_class);

    productIds.push(product_id);
    drafts.push({
      product_id,
      quantity,
      unit,
      unit_price,
      markup_percent,
      use_markup,
      ...(description ? { description } : {}),
      client_notes,
      show_product_description,
      hvac_filter_class,
      hvac_airflow_m3h,
      hvac_cleanroom_class,
    });
  }

  const finished = await assertFinishedProducts(admin, tenantId, productIds);
  if (!finished.ok) return finished;

  const { data: products, error: pErr } = await admin
    .from("products")
    .select(
      "id, name, type, cost_price, unit, technical_code, code, product_nature, hvac_filter_class, hvac_airflow_m3h, hvac_cleanroom_class"
    )
    .eq("tenant_id", tenantId)
    .in("id", [...new Set(productIds)]);

  if (pErr) {
    return { ok: false, message: "Erro ao carregar produtos: " + pErr.message };
  }

  const byId = new Map((products ?? []).map((p) => [p.id, p as ProductRow]));

  const lines: SaleLineInput[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    const p = byId.get(d.product_id);
    if (!p) {
      return { ok: false, message: `Item ${i + 1}: produto não encontrado` };
    }

    const cost = Number(p.cost_price ?? 0);
    let unit_price: number;
    let markup_percent: number | null;

    if (d.use_markup && d.markup_percent != null) {
      unit_price = unitPriceFromCostAndMarkup(cost, d.markup_percent);
      markup_percent = d.markup_percent;
    } else {
      unit_price = d.unit_price!;
      markup_percent = null;
    }

    const productHvac = hvacFromProduct(p);

    lines.push({
      product_id: d.product_id,
      description: d.description || productLabel(p),
      client_notes: d.client_notes ?? null,
      show_product_description: d.show_product_description,
      quantity: d.quantity,
      unit: d.unit ?? (p.unit?.trim() || "UN"),
      unit_price,
      markup_percent,
      hvac_filter_class: d.hvac_filter_class ?? productHvac.hvac_filter_class,
      hvac_airflow_m3h: d.hvac_airflow_m3h ?? productHvac.hvac_airflow_m3h,
      hvac_cleanroom_class:
        d.hvac_cleanroom_class ?? productHvac.hvac_cleanroom_class,
    });
  }

  return { ok: true, lines };
}

/** Recalcula total do cabeçalho (subtotal − desconto + imposto + frete CIF). */
export async function refreshQuoteHeaderTotals(
  admin: AdminClient,
  quoteId: string,
  tenantId: string
): Promise<void> {
  const { data: quote } = await admin
    .from("quotes")
    .select("subtotal, discount, tax, freight_cost, shipping_type")
    .eq("id", quoteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!quote) return;

  const subtotal = Number(quote.subtotal ?? 0);
  const discount = Number(quote.discount ?? 0);
  const tax = Number(quote.tax ?? 0);
  const freight =
    quote.shipping_type === "CIF" ? Number(quote.freight_cost ?? 0) : 0;
  const total =
    Math.round((subtotal - discount + tax + freight) * 100) / 100;

  await admin
    .from("quotes")
    .update({ total })
    .eq("id", quoteId)
    .eq("tenant_id", tenantId);
}
