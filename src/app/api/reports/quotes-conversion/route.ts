import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertReportsAccess } from "@/lib/utils/report-access";

export const dynamic = "force-dynamic";

/** Orçamentos já comunicados ao cliente (exclui rascunho). */
const NON_DRAFT_FUNNEL = new Set([
  "sent",
  "approved",
  "converted",
  "rejected",
]);

function isWon(q: { status: string; converted_to_sale_id: string | null }): boolean {
  return (
    q.status === "approved" ||
    q.status === "converted" ||
    !!q.converted_to_sale_id
  );
}

/**
 * GET /api/reports/quotes-conversion?days=365
 */
export async function GET(request: NextRequest) {
  const gate = await assertReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const days = Math.min(
    730,
    Math.max(30, parseInt(request.nextUrl.searchParams.get("days") ?? "365", 10) || 365)
  );
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  const admin = createSupabaseAdminClient();
  const { data: quotes, error } = await admin
    .from("quotes")
    .select("id, status, total, quote_date, converted_to_sale_id")
    .eq("tenant_id", tenantId)
    .gte("quote_date", fromStr);

  if (error) {
    return apiError("Orçamentos: " + error.message, 500);
  }

  const list = quotes ?? [];
  const funnel = {
    draft: 0,
    sent: 0,
    approved: 0,
    converted: 0,
    rejected: 0,
  };
  let submitted = 0;
  let won = 0;
  let wonValue = 0;
  let lostValue = 0;

  for (const q of list) {
    const st = q.status as keyof typeof funnel;
    if (st in funnel) {
      funnel[st as keyof typeof funnel] += 1;
    }
    if (NON_DRAFT_FUNNEL.has(q.status)) {
      submitted += 1;
      if (isWon(q)) {
        won += 1;
        wonValue += Number(q.total ?? 0);
      }
      if (q.status === "rejected") {
        lostValue += Number(q.total ?? 0);
      }
    }
  }

  const conversion_rate_pct =
    submitted > 0 ? Math.round((won / submitted) * 1000) / 10 : null;

  return apiOk({
    days,
    funnel,
    submitted_count: submitted,
    won_count: won,
    conversion_rate_pct,
    value_won: Math.round(wonValue * 100) / 100,
    value_lost_rejected: Math.round(lostValue * 100) / 100,
    notes:
      "Taxa = orçamentos ganhos (aprovados/convertidos ou com pedido de venda) / orçamentos já enviados ao cliente (exclui rascunho).",
  });
}
