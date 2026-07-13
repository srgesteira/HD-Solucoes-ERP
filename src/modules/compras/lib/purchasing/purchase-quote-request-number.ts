import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

const SOC_NUMBER_RE = /^SOC-(\d{4})-(\d+)$/i;

/** Formato espelhando orçamentos de venda (ORC-AAAA-NNNN): `SOC-2026-0001`. */
export function formatPurchaseQuoteRequestNumber(
  seq: number,
  year: number
): string {
  const n = Math.max(1, Math.floor(seq));
  return `SOC-${year}-${String(n).padStart(4, "0")}`;
}

export function parsePurchaseQuoteRequestNumber(
  requestNumber: string
): { seq: number; year: number } | null {
  const m = String(requestNumber ?? "").trim().match(SOC_NUMBER_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const seq = Number(m[2]);
  if (!Number.isFinite(seq) || !Number.isFinite(year) || seq < 1) return null;
  return { seq, year };
}

function yearFromDate(requestDate?: string | null): number {
  if (requestDate) {
    const y = Number(String(requestDate).slice(0, 4));
    if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y;
  }
  return new Date().getFullYear();
}

async function maxSequenceForYear(
  admin: Admin,
  tenantId: string,
  year: number
): Promise<number> {
  const prefix = `SOC-${year}-`;
  const { data, error } = await admin
    .from("purchase_quote_requests")
    .select("request_number")
    .eq("tenant_id", tenantId)
    .like("request_number", `${prefix}%`)
    .order("request_number", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  let max = 0;
  for (const row of data ?? []) {
    const parsed = parsePurchaseQuoteRequestNumber(row.request_number);
    if (parsed?.year === year) {
      max = Math.max(max, parsed.seq);
    }
  }
  return max;
}

/**
 * Próximo número de solicitação de orçamento de compras (`SOC-AAAA-NNNN`).
 */
export async function nextPurchaseQuoteRequestNumber(
  admin: Admin,
  tenantId: string,
  requestDate?: string | null
): Promise<string> {
  const year = yearFromDate(requestDate);

  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = (await maxSequenceForYear(admin, tenantId, year)) + 1 + attempt;
    const candidate = formatPurchaseQuoteRequestNumber(seq, year);

    const { data: clash } = await admin
      .from("purchase_quote_requests")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("request_number", candidate)
      .maybeSingle();

    if (!clash?.id) return candidate;
  }

  throw new Error(
    "Não foi possível gerar um número único para a solicitação de orçamento."
  );
}
