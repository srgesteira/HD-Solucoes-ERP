import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

const PO_NUMBER_RE = /^(\d+)\/(\d{4})$/;

/** Formato exibido: `1/2026`, `42/2027` (reinicia a cada ano). */
export function formatPurchaseOrderNumber(seq: number, year: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${n}/${year}`;
}

export function parsePurchaseOrderNumber(
  poNumber: string
): { seq: number; year: number } | null {
  const m = String(poNumber ?? "").trim().match(PO_NUMBER_RE);
  if (!m) return null;
  const seq = Number(m[1]);
  const year = Number(m[2]);
  if (!Number.isFinite(seq) || !Number.isFinite(year) || seq < 1) return null;
  return { seq, year };
}

function yearFromDate(orderDate?: string | null): number {
  if (orderDate) {
    const y = Number(String(orderDate).slice(0, 4));
    if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y;
  }
  return new Date().getFullYear();
}

async function maxSequenceForYear(
  admin: Admin,
  tenantId: string,
  year: number
): Promise<number> {
  const suffix = `/${year}`;
  const { data, error } = await admin
    .from("purchase_orders")
    .select("po_number")
    .eq("tenant_id", tenantId)
    .like("po_number", `%${suffix}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  let max = 0;
  for (const row of data ?? []) {
    const parsed = parsePurchaseOrderNumber(row.po_number);
    if (parsed?.year === year) {
      max = Math.max(max, parsed.seq);
    }
  }
  return max;
}

/**
 * Próximo número de PC no formato `{sequencial}/{ano}`.
 * A sequência reinicia em 1 a cada ano civil.
 */
export async function nextPurchaseOrderNumber(
  admin: Admin,
  tenantId: string,
  orderDate?: string | null
): Promise<string> {
  const year = yearFromDate(orderDate);

  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = (await maxSequenceForYear(admin, tenantId, year)) + 1 + attempt;
    const candidate = formatPurchaseOrderNumber(seq, year);

    const { data: clash } = await admin
      .from("purchase_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("po_number", candidate)
      .maybeSingle();

    if (!clash?.id) return candidate;
  }

  throw new Error("Não foi possível gerar um número único para o pedido de compra.");
}
