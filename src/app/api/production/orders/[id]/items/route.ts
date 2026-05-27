import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type OrderItemUpdate = Database["public"]["Tables"]["order_items"]["Update"];

const ITEM_SELECT = `
  *,
  product:products!order_items_product_id_fkey(*),
  line:production_lines!order_items_line_id_fkey(*)
`.trim();

const ITEM_STATUSES = new Set(["waiting", "scheduled", "completed", "delayed"]);

async function resolveOrderTenant(
  admin: SupabaseClient<Database>,
  tenantId: string,
  orderId: string
) {
  const { data, error } = await admin
    .from("production_orders")
    .select("id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return { order: data, error };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveOrderTenant(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  const { data, error } = await admin
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .order("item_number", { ascending: true, nullsFirst: false });

  if (error) {
    return apiError(
      "Erro ao listar itens: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

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

  const description =
    typeof b.description === "string" ? b.description.trim() : "";
  const quantityRaw = b.quantity;
  const quantity =
    typeof quantityRaw === "number"
      ? quantityRaw
      : typeof quantityRaw === "string"
        ? parseFloat(quantityRaw.replace(",", "."))
        : NaN;

  if (!description) {
    return apiError("Descrição é obrigatória", 400);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return apiError("Quantidade inválida", 400);
  }

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveOrderTenant(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  if (b.line_id !== undefined && b.line_id !== null) {
    const lineId = String(b.line_id);
    const { data: line } = await admin
      .from("production_lines")
      .select("id")
      .eq("id", lineId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!line) return apiError("Linha de produção inválida", 400);
  }

  if (b.product_id !== undefined && b.product_id !== null) {
    const productId = String(b.product_id);
    const { data: product } = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!product) return apiError("Produto inválido", 400);
  }

  const { data: lastItem } = await admin
    .from("order_items")
    .select("item_number")
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .order("item_number", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const lastNum =
    lastItem?.item_number != null ? Number(lastItem.item_number) : 0;
  const nextItemNumber = Number.isFinite(lastNum) ? lastNum + 1 : 1;

  const unit =
    b.unit !== undefined && b.unit !== null && String(b.unit).trim()
      ? String(b.unit).trim()
      : "UN";

  const product_id =
    b.product_id === undefined || b.product_id === null
      ? null
      : String(b.product_id);

  const line_id =
    b.line_id === undefined || b.line_id === null ? null : String(b.line_id);

  const production_start =
    b.production_start === null || b.production_start === undefined
      ? null
      : String(b.production_start).slice(0, 10);
  const production_end =
    b.production_end === null || b.production_end === undefined
      ? null
      : String(b.production_end).slice(0, 10);

  const estimated_hours =
    b.estimated_hours === undefined || b.estimated_hours === null
      ? null
      : typeof b.estimated_hours === "number"
        ? b.estimated_hours
        : parseFloat(String(b.estimated_hours));

  if (
    production_start &&
    production_end &&
    production_end < production_start
  ) {
    return apiError(
      "Data de fim de produção não pode ser anterior à de início.",
      400
    );
  }

  const scheduled = Boolean(production_start && production_end);

  const insertRow = {
    tenant_id: tenantId,
    order_id: orderId,
    item_number: nextItemNumber,
    description,
    quantity,
    unit,
    product_id,
    line_id,
    production_start,
    production_end,
    estimated_hours:
      estimated_hours != null && Number.isFinite(estimated_hours)
        ? estimated_hours
        : null,
    status: scheduled ? "scheduled" : "waiting",
  };

  const { data, error } = await admin
    .from("order_items")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return apiError(
      "Erro ao adicionar item: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;
  const itemId = request.nextUrl.searchParams.get("itemId");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!itemId?.trim()) {
    return apiError("Parâmetro itemId é obrigatório.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveOrderTenant(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  const { data: existingItem, error: loadItemErr } = await admin
    .from("order_items")
    .select("production_start, production_end, status, sales_order_item_id")
    .eq("id", itemId.trim())
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadItemErr) {
    return apiError(
      "Erro ao carregar item: " + loadItemErr.message,
      supabaseErrorToHttp(loadItemErr.code)
    );
  }
  if (!existingItem) return apiError("Item não encontrado", 404);

  const updateData: OrderItemUpdate = {};

  if (b.production_start !== undefined) {
    updateData.production_start =
      b.production_start === null
        ? null
        : String(b.production_start).slice(0, 10);
  }
  if (b.production_end !== undefined) {
    updateData.production_end =
      b.production_end === null ? null : String(b.production_end).slice(0, 10);
  }
  if (b.line_id !== undefined) {
    if (b.line_id === null) {
      updateData.line_id = null;
    } else {
      const lineIdStr = String(b.line_id);
      const { data: line } = await admin
        .from("production_lines")
        .select("id")
        .eq("id", lineIdStr)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!line) return apiError("Linha de produção inválida", 400);
      updateData.line_id = lineIdStr;
    }
  }

  const statusProvided = b.status !== undefined;
  if (statusProvided) {
    const st = String(b.status);
    if (!ITEM_STATUSES.has(st)) return apiError("Status de item inválido", 400);
    updateData.status = st;
    if (st === "completed") {
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = user.id;
    } else {
      updateData.completed_at = null;
      updateData.completed_by = null;
    }
  }

  if (b.actual_hours !== undefined) {
    if (b.actual_hours === null) {
      updateData.actual_hours = null;
    } else {
      const h =
        typeof b.actual_hours === "number"
          ? b.actual_hours
          : parseFloat(String(b.actual_hours));
      updateData.actual_hours = Number.isFinite(h) ? h : null;
    }
  }
  if (b.estimated_hours !== undefined) {
    if (b.estimated_hours === null) {
      updateData.estimated_hours = null;
    } else {
      const h =
        typeof b.estimated_hours === "number"
          ? b.estimated_hours
          : parseFloat(String(b.estimated_hours));
      updateData.estimated_hours = Number.isFinite(h) ? h : null;
    }
  }
  if (b.notes !== undefined) {
    updateData.notes = b.notes === null ? null : String(b.notes);
  }
  if (b.pcp_deadline !== undefined) {
    updateData.pcp_deadline =
      b.pcp_deadline === null
        ? null
        : String(b.pcp_deadline).slice(0, 10);
  }
  if (b.description !== undefined) {
    if (typeof b.description !== "string" || !b.description.trim()) {
      return apiError("Descrição inválida", 400);
    }
    updateData.description = b.description.trim();
  }
  if (b.quantity !== undefined) {
    const q =
      typeof b.quantity === "number"
        ? b.quantity
        : parseFloat(String(b.quantity));
    if (!Number.isFinite(q) || q <= 0) return apiError("Quantidade inválida", 400);
    updateData.quantity = q;
  }
  if (b.unit !== undefined) {
    updateData.unit =
      b.unit === null ? null : String(b.unit).trim() || null;
  }
  if (b.product_id !== undefined) {
    if (b.product_id === null) {
      updateData.product_id = null;
    } else {
      const productIdStr = String(b.product_id);
      const { data: product } = await admin
        .from("products")
        .select("id")
        .eq("id", productIdStr)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!product) return apiError("Produto inválido", 400);
      updateData.product_id = productIdStr;
    }
  }

  const mergedStart =
    updateData.production_start !== undefined
      ? (updateData.production_start as string | null)
      : existingItem.production_start;
  const mergedEnd =
    updateData.production_end !== undefined
      ? (updateData.production_end as string | null)
      : existingItem.production_end;

  if (
    mergedStart &&
    mergedEnd &&
    mergedEnd < mergedStart
  ) {
    return apiError(
      "Data de fim de produção não pode ser anterior à de início.",
      400
    );
  }

  const soiId = existingItem.sales_order_item_id;
  if (mergedStart && soiId) {
    const { data: linkRow, error: linkErr } = await admin
      .from("sales_order_items")
      .select("sales_order_id")
      .eq("id", soiId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (linkErr) {
      return apiError(
        "Erro ao validar linha de venda: " + linkErr.message,
        supabaseErrorToHttp(linkErr.code)
      );
    }
    if (linkRow?.sales_order_id) {
      const { data: soRow, error: soErr } = await admin
        .from("sales_orders")
        .select("order_date")
        .eq("id", linkRow.sales_order_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (soErr) {
        return apiError(
          "Erro ao validar pedido de venda: " + soErr.message,
          supabaseErrorToHttp(soErr.code)
        );
      }
      const od = soRow?.order_date?.slice(0, 10);
      const st = mergedStart.slice(0, 10);
      if (od && st < od) {
        return apiError(
          "Data de início de produção não pode ser anterior à data do pedido de venda (" +
            od +
            ").",
          400
        );
      }
    }
  }

  if (
    !statusProvided &&
    mergedStart &&
    mergedEnd &&
    mergedEnd >= mergedStart &&
    existingItem.status === "waiting"
  ) {
    updateData.status = "scheduled";
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const { data, error } = await admin
    .from("order_items")
    .update(updateData)
    .eq("id", itemId)
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return apiError(
      "Erro ao atualizar item: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Item não encontrado", 404);

  return apiOk({ data });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;
  const itemId = request.nextUrl.searchParams.get("itemId");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!itemId?.trim()) {
    return apiError("Parâmetro itemId é obrigatório.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveOrderTenant(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  const { data: deleted, error } = await admin
    .from("order_items")
    .delete()
    .eq("id", itemId)
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao remover item: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!deleted) return apiError("Item não encontrado", 404);

  return apiOk({ success: true });
}
