import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { sendPurchaseQuotationEmail } from "@/modules/compras/lib/purchasing/send-quotation-email";

type Admin = SupabaseClient<Database>;

export type QuoteRequestLineInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit: string;
  need_date?: string | null;
};

export type QuoteRequestResult = {
  item_ids: string[];
  item_count: number;
  suppliers_sent: Array<{ id: string; name: string; email: string }>;
  suppliers_skipped: Array<{ id: string; name: string; reason: string }>;
  email_sent_count: number;
  warning: string | null;
};

function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function supplierDisplayName(s: {
  name: string | null;
  legal_name: string | null;
}): string {
  return s.legal_name?.trim() || s.name?.trim() || "Fornecedor";
}

/**
 * Cria itens de requisição (sem PC e sem fornecedor fixo) e envia a mesma
 * solicitação de cotação a um ou mais fornecedores.
 */
export async function createAndSendPurchaseQuoteRequest(
  admin: Admin,
  tenantId: string,
  args: {
    /** Um ou mais fornecedores — a mesma RFQ pode ir para vários. */
    supplier_ids: string[];
    message?: string | null;
    notes?: string | null;
    request_date?: string | null;
    need_date?: string | null;
    lines: QuoteRequestLineInput[];
    extra_emails?: string[];
  }
): Promise<QuoteRequestResult> {
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

  const supplierIds = [
    ...new Set(args.supplier_ids.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!supplierIds.length) {
    throw new Error("Seleccione pelo menos um fornecedor para enviar a cotação.");
  }

  const { data: suppliers, error: supErr } = await admin
    .from("suppliers")
    .select("id, name, legal_name, email")
    .eq("tenant_id", tenantId)
    .in("id", supplierIds);
  if (supErr) throw new Error(supErr.message);
  if ((suppliers ?? []).length !== supplierIds.length) {
    throw new Error("Um ou mais fornecedores são inválidos.");
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

  const now = new Date().toISOString();
  const requestDate = dateOnly(args.request_date) ?? now.slice(0, 10);
  const headerNeedDate = dateOnly(args.need_date);
  const notes = args.notes?.trim() || null;
  const traceKey = `quote-request:${requestDate}:${now.slice(11, 19)}`;

  const inserts = lines.map((l) => {
    const product = l.product_id ? productMap.get(l.product_id) : null;
    const description = l.description || product?.name || "Item para cotação";
    const unit = l.unit || product?.unit?.trim() || "UN";
    const needDate = l.need_date ?? headerNeedDate;
    return {
      tenant_id: tenantId,
      purchase_order_id: null,
      status: "draft" as const,
      product_id: l.product_id,
      description,
      quantity: l.quantity,
      unit,
      unit_price: 0,
      total_price: 0,
      suggested_supplier_id: null,
      need_date: needDate,
      follow_up_date: needDate,
      quotation_sent_at: now,
      trace_key: traceKey,
      is_suggestion: false,
    };
  });

  const { data: inserted, error: insErr } = await admin
    .from("purchase_order_items")
    .insert(inserts)
    .select("id, description, quantity, unit, need_date, product_id");
  if (insErr) throw new Error(insErr.message);
  if (!inserted?.length) throw new Error("Não foi possível criar a solicitação.");

  const emailLines = inserted.map((row) => {
    const product = row.product_id ? productMap.get(row.product_id) : null;
    return {
      code: product?.technical_code?.trim() || "—",
      description: product?.name?.trim() || row.description,
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "UN",
      need_date: dateOnly(row.need_date),
    };
  });

  const messageParts = [
    args.message?.trim() ||
      "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento.",
  ];
  if (notes) messageParts.push(`Observações: ${notes}`);

  const message = messageParts.join("\n\n");
  const extraEmails = (args.extra_emails ?? [])
    .map((e) => e.trim())
    .filter(Boolean);

  const suppliersSent: QuoteRequestResult["suppliers_sent"] = [];
  const suppliersSkipped: QuoteRequestResult["suppliers_skipped"] = [];
  let emailSentCount = 0;
  const warnings: string[] = [];

  for (const supplier of suppliers ?? []) {
    const name = supplierDisplayName(supplier);
    const email = supplier.email?.trim() || "";
    const to = email ? [email, ...extraEmails] : [...extraEmails];

    if (!to.length) {
      suppliersSkipped.push({
        id: supplier.id,
        name,
        reason: "Sem e-mail no cadastro",
      });
      continue;
    }

    try {
      const emailResult = await sendPurchaseQuotationEmail({
        to,
        subject: `Solicitação de cotação — ${name}`,
        message,
        lines: emailLines,
      });
      if (emailResult.sent) emailSentCount += 1;
      if (emailResult.warning) warnings.push(emailResult.warning);
      suppliersSent.push({
        id: supplier.id,
        name,
        email: to[0],
      });
    } catch (e) {
      suppliersSkipped.push({
        id: supplier.id,
        name,
        reason: e instanceof Error ? e.message : "Falha no envio",
      });
    }
  }

  if (!suppliersSent.length) {
    throw new Error(
      suppliersSkipped[0]?.reason ||
        "Nenhum fornecedor com e-mail válido para enviar a cotação."
    );
  }

  return {
    item_ids: inserted.map((r) => r.id),
    item_count: inserted.length,
    suppliers_sent: suppliersSent,
    suppliers_skipped: suppliersSkipped,
    email_sent_count: emailSentCount,
    warning: warnings[0] ?? null,
  };
}

export type QuoteRequestHistoryRow = {
  id: string;
  product_code: string | null;
  product_name: string | null;
  description: string;
  quantity: number;
  unit: string;
  need_date: string | null;
  quotation_sent_at: string | null;
  trace_key: string | null;
};

export async function listPurchaseQuoteRequests(
  admin: Admin,
  tenantId: string,
  opts?: { limit?: number; search?: string }
): Promise<QuoteRequestHistoryRow[]> {
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 100));

  const { data, error } = await admin
    .from("purchase_order_items")
    .select(
      `
      id,
      description,
      quantity,
      unit,
      need_date,
      quotation_sent_at,
      trace_key,
      product:products!purchase_order_items_product_id_fkey(technical_code, name)
    `
    )
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .is("purchase_order_id", null)
    .not("quotation_sent_at", "is", null)
    .like("trace_key", "quote-request:%")
    .order("quotation_sent_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const search = opts?.search?.trim().toLowerCase();
  const rows: QuoteRequestHistoryRow[] = (data ?? []).map((row) => {
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    return {
      id: row.id,
      product_code: product?.technical_code ?? null,
      product_name: product?.name ?? null,
      description: row.description,
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "UN",
      need_date: dateOnly(row.need_date),
      quotation_sent_at: row.quotation_sent_at,
      trace_key: row.trace_key,
    };
  });

  if (!search) return rows;
  return rows.filter((r) => {
    const hay = [
      r.product_code,
      r.product_name,
      r.description,
      r.trace_key,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(search);
  });
}
