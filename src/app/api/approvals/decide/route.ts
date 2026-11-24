import { NextRequest } from "next/server";
import { apiError } from "@/modules/core/lib/http";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { requireFreshMfa } from "@/modules/agent/lib/mfa";
import { decideApprovals } from "@/modules/agent/lib/approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/approvals/decide — decisão em lote da tela de Aprovações (caixas de seleção).
 *   { ids: [uuid], decisao: "aprovado" | "rejeitado", nota? }
 * Só o diretor, com MFA feito há no máximo 30 min. Grava no log quem decidiu.
 */
export async function POST(request: NextRequest) {
  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  const b = (await request.json().catch(() => null)) as { ids?: unknown; decisao?: unknown; nota?: unknown } | null;
  if (!b) return apiError("Corpo JSON inválido.", 400);
  const ids = Array.isArray(b.ids) ? (b.ids as string[]) : [];
  return decideApprovals(
    asUntypedAdmin(createSupabaseAdminClient()),
    gate.tenantId,
    gate.userId,
    ids,
    String(b.decisao ?? ""),
    typeof b.nota === "string" ? b.nota : null
  );
}
