import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/lib/utils/tenant";
import {
  productCreateSchema,
} from "@/lib/schemas/product.schema";
import { assertProductClassificationTenant } from "@/lib/products/classification-validation";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

/** Escapa % e _ para usar em filtros `.ilike` dentro de `.or()`. */
function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const params = request.nextUrl.searchParams;

  const type = params.get("type");
  const isActive = params.get("is_active");
  const search = params.get("search")?.trim();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "25", 10) || 25));
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  let q = admin
    .from("products")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (type && type !== "all") {
    q = q.eq("type", type);
  }
  if (isActive !== null && isActive !== "") {
    q = q.eq("is_active", isActive === "true");
  }
  if (search) {
    const condensed = search.replace(/,/g, " ").trim();
    const safe = `%${escapeIlike(condensed)}%`;
    q = q.or(`name.ilike.${safe},technical_code.ilike.${safe}`);
  }

  q = q.order("technical_code", { ascending: true }).range(start, end);

  const { data, error, count } = await q;

  if (error) return apiError("Erro ao buscar produtos: " + error.message, 500);

  return apiOk({
    data: (data ?? []) as ProductRow[],
    pagination: { page, limit, total: count ?? 0 },
  });
}

export async function POST(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const validated = parsed.data;

  const classErr = await assertProductClassificationTenant(admin, tenantId, {
    prefix_id: validated.prefix_id,
    family_id: validated.family_id,
    subfamily_id: validated.subfamily_id,
    material_id: validated.material_id,
    finish_id: validated.finish_id,
  });
  if (classErr) {
    return apiError(classErr, 400);
  }

  const { data, error } = await admin
    .from("products")
    .insert({
      tenant_id: tenantId,
      code: null,
      technical_code: "",
      name: validated.name.trim(),
      description: validated.description ?? null,
      technical_description: validated.technical_description ?? null,
      ncm: validated.ncm ?? null,
      unit: validated.unit.trim(),
      type: validated.type,
      cost_price: 0,
      selling_price: validated.selling_price,
      is_active: validated.is_active,
      use_custom_bdi: validated.use_custom_bdi ?? false,
      custom_tax_rate:
        validated.custom_tax_rate !== undefined
          ? validated.custom_tax_rate
          : null,
      custom_profit_margin:
        validated.custom_profit_margin !== undefined
          ? validated.custom_profit_margin
          : null,
      prefix_id: validated.prefix_id,
      family_id: validated.family_id,
      subfamily_id: validated.subfamily_id,
      material_id: validated.material_id,
      finish_id: validated.finish_id,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError(
      "Já existe um produto com este código técnico no tenant.",
      409
    );
  }
  if (error) {
    return apiError(
      "Erro ao criar produto: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
