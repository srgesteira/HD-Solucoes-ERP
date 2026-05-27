import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type {
  PurchaseNFExtraction,
  PurchaseNFItem,
} from "@/modules/engenharia/lib/services/ai.service";
import { onlyDigits } from "@/shared/utils/br-document";

type Admin = SupabaseClient<Database>;

export type SupplierMatch = {
  id: string;
  name: string;
  code: string;
  document: string | null;
} | null;

export type PendingPoItem = {
  id: string;
  purchaseOrderId: string;
  poNumber: string;
  productId: string | null;
  description: string;
  quantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  unitPrice: number;
  unit: string;
  productName?: string | null;
  productCode?: string | null;
  productTechnicalCode?: string | null;
};

export type ProductCandidate = {
  id: string;
  name: string;
  code: string | null;
  technical_code: string | null;
  unit: string | null;
};

export type ReconcileSuggestion = {
  invoiceLineIndex: number;
  invoiceItem: PurchaseNFItem;
  suggestedPurchaseOrderItemId: string | null;
  suggestedPurchaseOrderId: string | null;
  suggestedProductId: string | null;
  confidence: number;
  matchReason?: string;
};

export type ReconcileUploadResult = {
  invoiceData: PurchaseNFExtraction;
  supplier: SupplierMatch;
  supplierDocumentDigits: string;
  openPurchaseOrders: Array<{
    id: string;
    po_number: string;
    status: string;
    order_date: string;
  }>;
  pendingItems: PendingPoItem[];
  productCandidates: ProductCandidate[];
  suggestions: ReconcileSuggestion[];
  unmatchedItems: ReconcileSuggestion[];
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(" ")
      .filter((t) => t.length > 2)
  );
}

/** Pontua similaridade 0–1 entre descrições. */
export function descriptionSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export async function findSupplierByDocument(
  admin: Admin,
  tenantId: string,
  documentRaw: string | undefined
): Promise<{ supplier: SupplierMatch; digits: string }> {
  const digits = onlyDigits(documentRaw ?? "");
  if (digits.length < 11) {
    return { supplier: null, digits };
  }

  const { data, error } = await admin
    .from("suppliers")
    .select("id, name, code, document")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const match = (data ?? []).find((s) => {
    const sd = onlyDigits(s.document ?? "");
    if (!sd) return false;
    return sd === digits || sd.endsWith(digits) || digits.endsWith(sd);
  });

  return {
    supplier: match ?
        {
          id: match.id,
          name: match.name,
          code: match.code,
          document: match.document,
        }
      : null,
    digits,
  };
}

const OPEN_PO_STATUSES = ["sent", "partial", "confirmed"] as const;

export async function loadOpenPurchaseContext(
  admin: Admin,
  tenantId: string,
  supplierId: string | null
): Promise<{
  openPurchaseOrders: ReconcileUploadResult["openPurchaseOrders"];
  pendingItems: PendingPoItem[];
}> {
  if (!supplierId) {
    return { openPurchaseOrders: [], pendingItems: [] };
  }

  const { data: orders, error: oErr } = await admin
    .from("purchase_orders")
    .select("id, po_number, status, order_date")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .in("status", [...OPEN_PO_STATUSES])
    .order("order_date", { ascending: false });

  if (oErr) throw new Error(oErr.message);

  const orderRows = orders ?? [];
  const orderIds = orderRows.map((o) => o.id);
  if (!orderIds.length) {
    return { openPurchaseOrders: orderRows, pendingItems: [] };
  }

  const { data: items, error: iErr } = await admin
    .from("purchase_order_items")
    .select(
      `
      id,
      purchase_order_id,
      product_id,
      description,
      quantity,
      received_quantity,
      unit_price,
      unit,
      product:products!purchase_order_items_product_id_fkey(
        id, name, code, technical_code
      )
    `.trim()
    )
    .eq("tenant_id", tenantId)
    .in("purchase_order_id", orderIds);

  if (iErr) throw new Error(iErr.message);

  type PoItemRow = {
    id: string;
    purchase_order_id: string | null;
    product_id: string | null;
    description: string;
    quantity: number;
    received_quantity: number;
    unit_price: number;
    unit: string;
    product:
      | {
          id: string;
          name: string;
          code: string | null;
          technical_code: string | null;
        }
      | {
          id: string;
          name: string;
          code: string | null;
          technical_code: string | null;
        }[]
      | null;
  };

  const poById = new Map(orderRows.map((o) => [o.id, o]));
  const pending: PendingPoItem[] = [];

  for (const row of (items ?? []) as unknown as PoItemRow[]) {
    const qty = Number(row.quantity);
    const recv = Number(row.received_quantity ?? 0);
    const pendingQty = Math.max(0, qty - recv);
    if (pendingQty <= 0) continue;

    const po = poById.get(row.purchase_order_id ?? "");
    if (!po) continue;

    const prod = row.product as
      | {
          id: string;
          name: string;
          code: string | null;
          technical_code: string | null;
        }
      | {
          id: string;
          name: string;
          code: string | null;
          technical_code: string | null;
        }[]
      | null;

    const p = Array.isArray(prod) ? prod[0] : prod;

    pending.push({
      id: row.id,
      purchaseOrderId: row.purchase_order_id!,
      poNumber: po.po_number,
      productId: row.product_id,
      description: row.description,
      quantity: qty,
      receivedQuantity: recv,
      pendingQuantity: pendingQty,
      unitPrice: Number(row.unit_price),
      unit: row.unit ?? "UN",
      productName: p?.name ?? null,
      productCode: p?.code ?? null,
      productTechnicalCode: p?.technical_code ?? null,
    });
  }

  const ordersWithPending = new Set(pending.map((p) => p.purchaseOrderId));
  const openPurchaseOrders = orderRows.filter((o) =>
    ordersWithPending.has(o.id)
  );

  return { openPurchaseOrders, pendingItems: pending };
}

export async function searchProductCandidates(
  admin: Admin,
  tenantId: string,
  invoiceItems: PurchaseNFItem[]
): Promise<ProductCandidate[]> {
  const terms = new Set<string>();
  for (const it of invoiceItems) {
    const code = it.productCode?.trim();
    if (code) terms.add(code.slice(0, 40));
    const words = normalizeText(it.description).split(" ").slice(0, 4);
    if (words.length) terms.add(words.join(" ").slice(0, 60));
  }

  const map = new Map<string, ProductCandidate>();
  for (const term of terms) {
    if (term.length < 3) continue;
    const safe = term.replace(/%/g, "").replace(/_/g, "");
    const { data } = await admin
      .from("products")
      .select("id, name, code, technical_code, unit")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or(
        `name.ilike.%${safe}%,code.ilike.%${safe}%,technical_code.ilike.%${safe}%`
      )
      .limit(15);

    for (const p of data ?? []) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        code: p.code,
        technical_code: p.technical_code,
        unit: p.unit,
      });
    }
  }

  return [...map.values()];
}

function findProductForInvoiceLine(
  item: PurchaseNFItem,
  products: ProductCandidate[]
): { productId: string | null; confidence: number; reason?: string } {
  const code = item.productCode?.trim();
  if (code) {
    const normCode = normalizeText(code);
    for (const p of products) {
      const pc = normalizeText(p.code ?? "");
      const pt = normalizeText(p.technical_code ?? "");
      if (pc === normCode || pt === normCode || pc.includes(normCode)) {
        return { productId: p.id, confidence: 0.95, reason: "código produto" };
      }
    }
  }

  let best: { id: string; score: number } | null = null;
  for (const p of products) {
    const score = Math.max(
      descriptionSimilarity(item.description, p.name),
      descriptionSimilarity(item.description, p.code ?? ""),
      descriptionSimilarity(item.description, p.technical_code ?? "")
    );
    if (!best || score > best.score) {
      best = { id: p.id, score };
    }
  }

  if (best && best.score >= 0.45) {
    return {
      productId: best.id,
      confidence: Math.min(0.9, best.score),
      reason: "descrição similar",
    };
  }

  return { productId: null, confidence: 0, reason: undefined };
}

function findPoItemForLine(
  item: PurchaseNFItem,
  productId: string | null,
  pendingItems: PendingPoItem[]
): {
  poItemId: string | null;
  poId: string | null;
  confidence: number;
  reason?: string;
} {
  let best: {
    id: string;
    poId: string;
    score: number;
    reason: string;
  } | null = null;

  for (const po of pendingItems) {
    let score = 0;
    let reason = "";

    if (productId && po.productId === productId) {
      score = 0.95;
      reason = "produto no pedido";
    } else {
      const sim = descriptionSimilarity(item.description, po.description);
      if (po.productName) {
        score = Math.max(sim, descriptionSimilarity(item.description, po.productName));
      } else {
        score = sim;
      }
      reason = "descrição no pedido";
    }

    const code = item.productCode?.trim();
    if (code && po.productCode) {
      const nc = normalizeText(code);
      if (
        normalizeText(po.productCode) === nc ||
        normalizeText(po.productTechnicalCode ?? "") === nc
      ) {
        score = Math.max(score, 0.92);
        reason = "código no pedido";
      }
    }

    if (score >= 0.5 && (!best || score > best.score)) {
      best = {
        id: po.id,
        poId: po.purchaseOrderId,
        score,
        reason,
      };
    }
  }

  if (!best) {
    return { poItemId: null, poId: null, confidence: 0 };
  }

  return {
    poItemId: best.id,
    poId: best.poId,
    confidence: Math.min(0.98, best.score),
    reason: best.reason,
  };
}

export function buildReconciliationSuggestions(
  invoiceData: PurchaseNFExtraction,
  pendingItems: PendingPoItem[],
  products: ProductCandidate[]
): {
  suggestions: ReconcileSuggestion[];
  unmatchedItems: ReconcileSuggestion[];
} {
  const suggestions: ReconcileSuggestion[] = [];

  invoiceData.items.forEach((invoiceItem, index) => {
    const prodMatch = findProductForInvoiceLine(invoiceItem, products);
    const poMatch = findPoItemForLine(
      invoiceItem,
      prodMatch.productId,
      pendingItems
    );

    let confidence = 0;
    const reasons: string[] = [];
    if (poMatch.poItemId) {
      confidence = Math.max(confidence, poMatch.confidence);
      if (poMatch.reason) reasons.push(poMatch.reason);
    }
    if (prodMatch.productId) {
      confidence = Math.max(confidence, prodMatch.confidence * 0.9);
      if (prodMatch.reason) reasons.push(prodMatch.reason);
    }

    suggestions.push({
      invoiceLineIndex: index,
      invoiceItem,
      suggestedPurchaseOrderItemId: poMatch.poItemId,
      suggestedPurchaseOrderId: poMatch.poId,
      suggestedProductId: prodMatch.productId,
      confidence: Math.round(confidence * 100) / 100,
      matchReason: reasons.length ? reasons.join("; ") : undefined,
    });
  });

  const unmatchedItems = suggestions.filter(
    (s) => !s.suggestedPurchaseOrderItemId || s.confidence < 0.5
  );

  return { suggestions, unmatchedItems };
}

export async function buildPurchaseInvoiceReconciliation(
  admin: Admin,
  tenantId: string,
  invoiceData: PurchaseNFExtraction
): Promise<ReconcileUploadResult> {
  const { supplier, digits } = await findSupplierByDocument(
    admin,
    tenantId,
    invoiceData.supplierDocument
  );

  const { openPurchaseOrders, pendingItems } = await loadOpenPurchaseContext(
    admin,
    tenantId,
    supplier?.id ?? null
  );

  const productCandidates = await searchProductCandidates(
    admin,
    tenantId,
    invoiceData.items
  );

  const { suggestions, unmatchedItems } = buildReconciliationSuggestions(
    invoiceData,
    pendingItems,
    productCandidates
  );

  return {
    invoiceData,
    supplier,
    supplierDocumentDigits: digits,
    openPurchaseOrders,
    pendingItems,
    productCandidates,
    suggestions,
    unmatchedItems,
  };
}
