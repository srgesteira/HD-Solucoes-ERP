import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { requireFreshMfa } from "@/modules/agent/lib/mfa";
import { decideApprovals } from "@/modules/agent/lib/approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST /api/approvals/{id}/decide — { decisao: "aprovado" | "rejeitado", nota? }. Diretor com MFA. */
export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { decisao?: unknown; nota?: unknown };
  return decideApprovals(
    asUntypedAdmin(createSupabaseAdminClient()),
    gate.tenantId,
    gate.userId,
    [String(id ?? "")],
    String(b.decisao ?? ""),
    typeof b.nota === "string" ? b.nota : null
  );
}
