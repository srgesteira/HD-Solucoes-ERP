import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { nextPurchaseQuoteRequestNumber } from "@/modules/compras/lib/purchasing/purchase-quote-request-number";

type Admin = SupabaseClient<Database>;

export type QuoteRequestLineInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit: string;
  need_date?: string | null;
};

export type PurchaseQuoteRequestListRow = {
  id: string;
  request_number: string;
  request_date: string;
  need_date: string | null;
  status: string;
  notes: string | null;
  item_count: number;
  created_at: string;
};

export type PurchaseQuoteRequestItem = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  need_date: string | null;
  product?: {
    id: string;
    name: string;
    technical_code: string | null;
    code: string | null;
  } | null;
};

export type PurchaseQuoteRequestDetail = {
  id: string;
  request_number: string;
  request_date: string;
  need_date: string | null;
  notes: string | null;
  message: string | null;
  status: string;
  created_at: string;
  items: PurchaseQuoteRequestItem[];
};

function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Grava solicitação de orçamento com número (como PC) — sem envio de e-mail.
 * O PDF / e-mail ficam para a página de impressão.
 */
export async function createPurchaseQuoteRequest(
  admin: Admin,
  tenantId: string,
  userId: string | null,
  args: {
    request_date?: string | null;
    need_date?: string | null;
    notes?: string | null;
    message?: string | null;
    lines: QuoteRequestLineInput[];
  }
): Promise<{ id: string; request_number: string }> {
  const lines = args.lines
    .map((l) => ({
      product_id: l.product_id?.trim() || null,
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unit: (l.unit?.trim() || "UN").toUpperCase(),
      need_date: dateOnly(l.need_date) ?? dateOnly(args.need_date),
    }))
    .filter((l) => l.description && Number.isFinite(l.quantity) && l.quantity > 0);

  if (!lines.length) {
    throw new Error("Indique pelo menos um item com descrição e quantidade.");
  }

  const productIds = [
    ...new Set(lines.map((l) => l.product_id).filter((id): id is string => !!id)),
  ];
  const productMap = new Map<
    string,
    { technical_code: string | null; name: string; unit: string | null }
  >();
  if (productIds.length) {
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, technical_code, name, unit")
      .eq("tenant_id", tenantId)
      .in("id", productIds);
    if (prodErr) throw new Error(prodErr.message);
    for (const p of products ?? []) {
      productMap.set(p.id, {
        technical_code: p.technical_code,
        name: p.name,
        unit: p.unit,
      });
    }
    for (const id of productIds) {
      if (!productMap.has(id)) throw new Error("Produto inválido na solicitação.");
    }
  }

  const requestDate = dateOnly(args.request_date) ?? new Date().toISOString().slice(0, 10);
  const needDate = dateOnly(args.need_date);
  const requestNumber = await nextPurchaseQuoteRequestNumber(
    admin,
    tenantId,
    requestDate
  );

  let requestedBy: string | null = null;
  if (userId) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    requestedBy = profile?.id ?? null;
  }

  const { data: header, error: headerErr } = await admin
    .from("purchase_quote_requests")
    .insert({
      tenant_id: tenantId,
      request_number: requestNumber,
      request_date: requestDate,
      need_date: needDate,
      notes: args.notes?.trim() || null,
      message:
        args.message?.trim() ||
        "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento.",
      status: "draft",
      requested_by: requestedBy,
    })
    .select("id, request_number")
    .single();

  if (headerErr?.code === "23505") {
    throw new Error("Número de solicitação já existe. Tente novamente.");
  }
  if (headerErr) throw new Error(headerErr.message);
  if (!header) throw new Error("Não foi possível criar a solicitação.");

  const inserts = lines.map((l) => {
    const product = l.product_id ? productMap.get(l.product_id) : null;
    const description = l.description || product?.name || "Item para cotação";
    const unit = l.unit || product?.unit?.trim() || "UN";
    const lineNeed = l.need_date ?? needDate;
    return {
      tenant_id: tenantId,
      purchase_order_id: null,
      purchase_quote_request_id: header.id,
      status: "draft" as const,
      product_id: l.product_id,
      description,
      quantity: l.quantity,
      unit,
      unit_price: 0,
      total_price: 0,
      suggested_supplier_id: null,
      need_date: lineNeed,
      follow_up_date: lineNeed,
      quotation_sent_at: null,
      trace_key: `quote-request:${header.request_number}`,
      is_suggestion: false,
    };
  });

  const { error: insErr } = await admin.from("purchase_order_items").insert(inserts);
  if (insErr) {
    await admin
      .from("purchase_quote_requests")
      .delete()
      .eq("id", header.id)
      .eq("tenant_id", tenantId);
    throw new Error(insErr.message);
  }

  return { id: header.id, request_number: header.request_number };
}

export async function listPurchaseQuoteRequests(
  admin: Admin,
  tenantId: string,
  opts?: { limit?: number; search?: string }
): Promise<PurchaseQuoteRequestListRow[]> {
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 100));

  const { data, error } = await admin
    .from("purchase_quote_requests")
    .select(
      `
      id,
      request_number,
      request_date,
      need_date,
      status,
      notes,
      created_at,
      items:purchase_order_items!purchase_order_items_purchase_quote_request_id_fkey(id)
    `
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const search = opts?.search?.trim().toLowerCase();
  const rows: PurchaseQuoteRequestListRow[] = (data ?? []).map((row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      id: row.id,
      request_number: row.request_number,
      request_date: String(row.request_date).slice(0, 10),
      need_date: dateOnly(row.need_date),
      status: row.status,
      notes: row.notes,
      item_count: items.length,
      created_at: row.created_at,
    };
  });

  if (!search) return rows;
  return rows.filter((r) => {
    const hay = [r.request_number, r.notes, r.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(search);
  });
}

export async function getPurchaseQuoteRequest(
  admin: Admin,
  tenantId: string,
  id: string
): Promise<PurchaseQuoteRequestDetail | null> {
  const { data, error } = await admin
    .from("purchase_quote_requests")
    .select(
      `
      id,
      request_number,
      request_date,
      need_date,
      notes,
      message,
      status,
      created_at,
      items:purchase_order_items!purchase_order_items_purchase_quote_request_id_fkey(
        id,
        product_id,
        description,
        quantity,
        unit,
        need_date,
        product:products!purchase_order_items_product_id_fkey(
          id,
          name,
          technical_code,
          code
        )
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: PurchaseQuoteRequestItem[] = itemsRaw.map((row) => {
    const product = unwrapOne(row.product);
    return {
      id: row.id,
      product_id: row.product_id,
      description: row.description,
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "UN",
      need_date: dateOnly(row.need_date),
      product: product
        ? {
            id: product.id,
            name: product.name,
            technical_code: product.technical_code,
            code: product.code,
          }
        : null,
    };
  });

  return {
    id: data.id,
    request_number: data.request_number,
    request_date: String(data.request_date).slice(0, 10),
    need_date: dateOnly(data.need_date),
    notes: data.notes,
    message: data.message,
    status: data.status,
    created_at: data.created_at,
    items,
  };
}

export function purchaseQuoteRequestStatusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Enviada";
    case "cancelled":
      return "Cancelada";
    default:
      return "Rascunho";
  }
}
