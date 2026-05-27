import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type ProductionOrderUpdate =
  Database["public"]["Tables"]["production_orders"]["Update"];

/** Detalhe do pedido com itens e relações — FK explícitos evitam ambiguidades no PostgREST. */
const ORDER_DETAIL_SELECT =
  `
  *,
  items:order_items(
    *,
    product:products!order_items_product_id_fkey(*),
    line:production_lines!order_items_line_id_fkey(*),
    completed_by_user:user_profiles!order_items_completed_by_fkey(*)
  )
`.trim();

const ORDER_STATUSES = new Set([
  "imported",
  "planning",
  "in_production",
  "ready",
  "finished",
  "delayed",
  "cancelled",
]);

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: order, error: orderError } = await admin
    .from("production_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderError) {
    return apiError(
      "Erro ao buscar pedido: " + orderError.message,
      supabaseErrorToHttp(orderError.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  return apiOk({ data: order });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

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

  const updateData: ProductionOrderUpdate = {};

  if (b.client_name !== undefined) {
    updateData.client_name =
      b.client_name === null ? null : String(b.client_name);
  }
  if (b.description !== undefined) {
    updateData.description =
      b.description === null ? null : String(b.description);
  }
  if (b.client_document !== undefined) {
    updateData.client_document =
      b.client_document === null ? null : String(b.client_document);
  }
  if (b.delivery_deadline !== undefined) {
    updateData.delivery_deadline =
      b.delivery_deadline === null
        ? null
        : String(b.delivery_deadline).slice(0, 10);
  }
  if (b.pcp_deadline !== undefined) {
    updateData.pcp_deadline =
      b.pcp_deadline === null ? null : String(b.pcp_deadline).slice(0, 10);
  }
  if (b.notes !== undefined) {
    updateData.notes = b.notes === null ? null : String(b.notes);
  }
  if (b.pdf_path !== undefined) {
    updateData.pdf_path = b.pdf_path === null ? null : String(b.pdf_path);
  }
  if (b.folder_path !== undefined) {
    updateData.folder_path =
      b.folder_path === null ? null : String(b.folder_path);
  }
  if (b.status !== undefined) {
    const st = String(b.status);
    if (!ORDER_STATUSES.has(st)) {
      return apiError("Status inválido", 400);
    }
    updateData.status = st;
    if (st === "finished") {
      updateData.finished_at = new Date().toISOString();
    } else {
      updateData.finished_at = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("production_orders")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao atualizar pedido: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Pedido não encontrado", 404);

  return apiOk({ data });
}

/** Remoção definitiva do pedido e itens (CASCADE). Apenas admin do tenant. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: removed, error } = await admin
    .from("production_orders")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao remover pedido: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!removed) return apiError("Pedido não encontrado", 404);

  return apiOk({ success: true });
}
