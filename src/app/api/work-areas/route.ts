import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import type { Database } from "@/lib/types/database";
import {
  createWorkAreaSchema,
  updateWorkAreaSchema,
} from "@/lib/validators/work-area";

export const dynamic = "force-dynamic";

type WorkAreaRow = Database["public"]["Tables"]["work_areas"]["Row"];

/**
 * GET — áreas do tenant (tipo centros de custo). Por defeito só activas.
 * `?include_archived=1` — inclui arquivadas (apenas admins).
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError("Não autenticado", 401);

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return apiError("Perfil não encontrado", 403);
  }

  const incArch =
    request.nextUrl.searchParams.get("include_archived") === "1" &&
    profile.role === "admin";

  let q = admin
    .from("work_areas")
    .select("id, tenant_id, code, name, description, sort_order, is_archived, created_at")
    .eq("tenant_id", profile.tenant_id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!incArch) {
    q = q.eq("is_archived", false);
  }

  const { data: rows, error } = await q;

  if (error) return apiError("Falha ao listar áreas: " + error.message, 500);

  return apiOk({ areas: (rows ?? []) as WorkAreaRow[] });
}

/** POST — cria área (apenas admins do tenant). */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError("Não autenticado", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = createWorkAreaSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return apiError("Perfil não encontrado", 403);
  }
  if (profile.role !== "admin") {
    return apiError("Apenas administradores gerem áreas", 403);
  }

  const { data: existing } = await admin
    .from("work_areas")
    .select("sort_order")
    .eq("tenant_id", profile.tenant_id);

  const sort_order =
    (existing ?? []).reduce((m, r) => Math.max(m, r.sort_order), 0) + 1000;

  const code = parsed.data.code.toUpperCase();

  const { data: row, error: insErr } = await admin
    .from("work_areas")
    .insert({
      tenant_id: profile.tenant_id,
      code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sort_order,
    })
    .select("id, tenant_id, code, name, description, sort_order, is_archived, created_at")
    .single();

  if (insErr?.code === "23505") {
    return apiError(`Já existe uma área com o código "${code}".`, 409);
  }
  if (insErr || !row) {
    return apiError("Falha ao criar área: " + (insErr?.message ?? ""), 500);
  }

  return apiOk({ area: row as WorkAreaRow }, 201);
}
