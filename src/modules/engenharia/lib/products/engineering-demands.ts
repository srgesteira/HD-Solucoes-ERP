import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { ENGINEERING_STATUS_PENDING } from "@/modules/engenharia/lib/products/engineering-workflow";

type Admin = SupabaseClient<Database>;

export type EngineeringDemandRow = {
  product_id: string;
  product_code: string | null;
  product_name: string;
  engineering_workflow_status: string | null;
  composition_requested_at: string | null;
  source_quote_id: string | null;
  quote_number: string | null;
  client_name: string | null;
  quote_total: number;
  blocked_quotes_count: number;
  origin: "commercial" | "internal";
  urgency_score: number;
};

export async function loadEngineeringDemands(
  admin: Admin,
  tenantId: string,
  sort: "urgency" | "oldest" = "urgency"
): Promise<EngineeringDemandRow[]> {
  const { data: products, error: pErr } = await admin
    .from("products")
    .select(
      "id, name, technical_code, code, engineering_workflow_status, composition_requested_at, source_quote_id, released_for_sale"
    )
    .eq("tenant_id", tenantId)
    .eq("engineering_workflow_status", ENGINEERING_STATUS_PENDING);

  if (pErr) throw new Error(pErr.message);

  const quoteIds = [
    ...new Set(
      (products ?? [])
        .map((p) => p.source_quote_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const quoteById = new Map<
    string,
    { quote_number: string; client_name: string | null; total: number }
  >();

  if (quoteIds.length) {
    const { data: quotes, error: qErr } = await admin
      .from("quotes")
      .select("id, quote_number, client_name, total")
      .eq("tenant_id", tenantId)
      .in("id", quoteIds);
    if (qErr) throw new Error(qErr.message);
    for (const q of quotes ?? []) {
      quoteById.set(q.id, {
        quote_number: q.quote_number,
        client_name: q.client_name,
        total: Number(q.total ?? 0),
      });
    }
  }

  const productIds = (products ?? []).map((p) => p.id);
  const blockedByProduct = new Map<string, { count: number; total: number }>();

  if (productIds.length) {
    const { data: quoteItems, error: qiErr } = await admin
      .from("quote_items")
      .select("product_id, quote:quotes!inner(id, status, total)")
      .eq("tenant_id", tenantId)
      .in("product_id", productIds);

    if (qiErr) throw new Error(qiErr.message);

    for (const row of quoteItems ?? []) {
      const pid = row.product_id as string | null;
      if (!pid) continue;
      const qRaw = row.quote as
        | { status: string; total: number }
        | { status: string; total: number }[]
        | null;
      const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
      if (!q || !["sent", "approved", "revision"].includes(q.status)) continue;
      const cur = blockedByProduct.get(pid) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(q.total ?? 0);
      blockedByProduct.set(pid, cur);
    }
  }

  const rows: EngineeringDemandRow[] = (products ?? []).map((p) => {
    const quote = p.source_quote_id
      ? quoteById.get(p.source_quote_id)
      : undefined;
    const blocked = blockedByProduct.get(p.id);
    const quoteTotal = quote?.total ?? blocked?.total ?? 0;
    const blockedCount = blocked?.count ?? 0;
    const requestedAt = p.composition_requested_at
      ? new Date(p.composition_requested_at).getTime()
      : 0;
    const ageDays = requestedAt
      ? (Date.now() - requestedAt) / 86400000
      : 0;

    return {
      product_id: p.id,
      product_code: p.technical_code ?? p.code,
      product_name: p.name,
      engineering_workflow_status: p.engineering_workflow_status,
      composition_requested_at: p.composition_requested_at,
      source_quote_id: p.source_quote_id,
      quote_number: quote?.quote_number ?? null,
      client_name: quote?.client_name ?? null,
      quote_total: quoteTotal,
      blocked_quotes_count: blockedCount,
      origin: p.source_quote_id ? "commercial" : "internal",
      urgency_score: quoteTotal + ageDays * 100 + blockedCount * 500,
    };
  });

  rows.sort((a, b) => {
    if (sort === "oldest") {
      const ta = a.composition_requested_at ?? "";
      const tb = b.composition_requested_at ?? "";
      return ta.localeCompare(tb);
    }
    return b.urgency_score - a.urgency_score;
  });

  return rows;
}
