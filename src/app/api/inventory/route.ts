import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
  currentUserCanModule,
} from "@/modules/core/lib/tenant";
import { applyInventoryBalanceUpdate } from "@/modules/almoxarifado/lib/inventory-adjustment";

export const dynamic = "force-dynamic";

/** GET /api/inventory — lista; ?product_id= filtra um produto */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (
    !(await isCurrentUserTenantAdmin()) &&
    !(await currentUserCanModule("inventory"))
  ) {
    return apiError("Sem permissão para consultar estoque.", 403);
  }

  const productId = request.nextUrl.searchParams.get("product_id")?.trim();

  const admin = createSupabaseAdminClient();
  let q = admin
    .from("inventory")
    .select(
      `
      *,
      product:products!inventory_product_id_fkey(id, name, technical_code, unit, type)
    `.trim()
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (productId) {
    q = q.eq("product_id", productId);
  }

  const { data, error } = await q;

  if (error) {
    return apiError(
      "Erro ao listar estoque: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}

/** POST /api/inventory — ajuste de saldo com movimento no extrato (admin) */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("almoxarifado");
  if (!access.ok) return access.response;
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem alterar estoque.", 403);
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

  const product_id =
    typeof b.product_id === "string" ? b.product_id.trim() : "";
  if (!product_id) return apiError("product_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const { data: prod, error: pErr } = await admin
    .from("products")
    .select("id")
    .eq("id", product_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (pErr || !prod) return apiError("Produto inválido", 400);

  const quantity_on_hand =
    b.quantity_on_hand !== undefined && b.quantity_on_hand !== null
      ? Number(b.quantity_on_hand)
      : 0;
  const reserved_quantity =
    b.reserved_quantity !== undefined && b.reserved_quantity !== null
      ? Number(b.reserved_quantity)
      : 0;
  const reorder_point =
    b.reorder_point !== undefined && b.reorder_point !== null
      ? Number(b.reorder_point)
      : 0;
  const reorder_quantity =
    b.reorder_quantity !== undefined && b.reorder_quantity !== null
      ? Number(b.reorder_quantity)
      : 0;
  const reason =
    typeof b.reason === "string" ? b.reason.trim() || undefined : undefined;

  if (!Number.isFinite(quantity_on_hand) || quantity_on_hand < 0) {
    return apiError("quantity_on_hand inválido", 400);
  }
  if (!Number.isFinite(reserved_quantity) || reserved_quantity < 0) {
    return apiError("reserved_quantity inválido", 400);
  }

  const result = await applyInventoryBalanceUpdate(admin, tenantId, product_id, {
    quantity_on_hand,
    reserved_quantity,
    reorder_point,
    reorder_quantity,
    reason,
    userId: user.id,
  });

  if (result.error) {
    return apiError("Erro ao gravar estoque: " + result.error, 500);
  }

  const { data, error } = await admin
    .from("inventory")
    .select()
    .eq("tenant_id", tenantId)
    .eq("product_id", product_id)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao ler estoque: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data, delta: result.delta ?? 0 }, 201);
}
