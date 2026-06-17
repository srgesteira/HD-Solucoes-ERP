import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("product_routing_steps")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .order("sequence", { ascending: true });

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }
  return apiOk({ items: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const sequence = Number(b.sequence);
  if (!name || !Number.isFinite(sequence) || sequence < 1) {
    return apiError("name e sequence são obrigatórios", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!product) return apiError("Produto não encontrado", 404);

  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("product_routing_steps")
    .insert({
      tenant_id: tenantId,
      product_id: productId,
      sequence,
      name,
      production_line_id:
        b.production_line_id === null || b.production_line_id === undefined
          ? null
          : String(b.production_line_id),
      work_center_id:
        b.work_center_id === null || b.work_center_id === undefined
          ? null
          : String(b.work_center_id),
      default_duration_minutes:
        b.default_duration_minutes === null ||
        b.default_duration_minutes === undefined
          ? null
          : Number(b.default_duration_minutes),
      notes:
        b.notes === null || b.notes === undefined ? null : String(b.notes),
    })
    .select("*")
    .single();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }
  return apiOk({ data }, 201);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;
  const stepId = request.nextUrl.searchParams.get("stepId");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);
  if (!stepId) return apiError("stepId é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("product_routing_steps")
    .delete()
    .eq("id", stepId)
    .eq("product_id", productId)
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }
  return apiOk({ success: true });
}
