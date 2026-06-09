import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import { processMrpForStockProductionOrder } from "@/modules/pcp/lib/mrp-service";

export const dynamic = "force-dynamic";

function buildStockOpNumber(): string {
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  const suf = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OP-ESTOQUE-${day}-${suf}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("pcp");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const productId =
    typeof b.product_id === "string" ? b.product_id.trim() : "";
  const lineIdRaw =
    typeof b.line_id === "string" ? b.line_id.trim() : "";
  const qty = Number(b.quantity);

  if (!productId) return apiError("product_id é obrigatório.", 400);
  if (!Number.isFinite(qty) || qty <= 0) {
    return apiError("quantity inválida.", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: product, error: pErr } = await admin
    .from("products")
    .select("id, name, unit, default_production_line_id")
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .maybeSingle();
  if (pErr) return apiError(pErr.message, supabaseErrorToHttp(pErr.code));
  if (!product) return apiError("Produto não encontrado.", 404);

  const lineId = lineIdRaw || product.default_production_line_id || "";
  if (!lineId) {
    return apiError(
      "O produto não tem linha padrão. Informe line_id para criar a OP.",
      400
    );
  }

  const { data: op, error: opErr } = await admin
    .from("production_orders")
    .insert({
      tenant_id: tenantId,
      order_number: buildStockOpNumber(),
      client_name: "Estoque",
      status: "planning",
      created_by: user.id,
      source_kind: "stock",
      is_suggestion: false,
    })
    .select("id, order_number, status, source_kind, is_suggestion")
    .single();
  if (opErr) return apiError(opErr.message, supabaseErrorToHttp(opErr.code));

  const { data: item, error: iErr } = await admin
    .from("order_items")
    .insert({
      tenant_id: tenantId,
      order_id: op.id,
      product_id: product.id,
      description: product.name ?? "Produto",
      quantity: qty,
      unit: product.unit ?? null,
      line_id: lineId,
      status: "planning",
      is_suggestion: false,
    })
    .select("id, line_id, quantity, unit, description")
    .single();
  if (iErr) return apiError(iErr.message, supabaseErrorToHttp(iErr.code));

  let mrp: Awaited<ReturnType<typeof processMrpForStockProductionOrder>> | null =
    null;
  try {
    mrp = await processMrpForStockProductionOrder(
      admin,
      tenantId,
      user.id,
      op.id,
      true
    );
  } catch (mrpErr) {
    console.warn(
      "[production-orders] MRP pós-criação falhou:",
      mrpErr instanceof Error ? mrpErr.message : mrpErr
    );
  }

  return apiOk({ production_order: op, item, mrp });
}

