import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import type { Database } from "@/modules/core/types/database";
import { updateWorkAreaSchema } from "@/modules/engenharia/lib/validators/work-area";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type WorkAreaRow = Database["public"]["Tables"]["work_areas"]["Row"];

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: areaId } = await params;

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

  const parsed = updateWorkAreaSchema.safeParse(body);
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

  const { data: row, error: loadErr } = await admin
    .from("work_areas")
    .select("id, tenant_id")
    .eq("id", areaId)
    .maybeSingle();

  if (loadErr || !row || row.tenant_id !== profile.tenant_id) {
    return apiError("Área não encontrada", 404);
  }

  const patch = parsed.data;
  if (
    patch.name === undefined &&
    patch.description === undefined &&
    patch.sort_order === undefined &&
    patch.is_archived === undefined
  ) {
    return apiError("Nada para atualizar", 400);
  }

  const updateRow: Partial<Pick<WorkAreaRow, "name" | "description" | "sort_order" | "is_archived">> = {};
  if (patch.name !== undefined) updateRow.name = patch.name;
  if (patch.description !== undefined) updateRow.description = patch.description;
  if (patch.sort_order !== undefined) updateRow.sort_order = patch.sort_order;
  if (patch.is_archived !== undefined) updateRow.is_archived = patch.is_archived;

  const { data: updated, error: upErr } = await admin
    .from("work_areas")
    .update(updateRow)
    .eq("id", areaId)
    .select(
      "id, tenant_id, code, name, description, sort_order, is_archived, created_at, updated_at"
    )
    .single();

  if (upErr || !updated) {
    return apiError("Falha ao atualizar área: " + (upErr?.message ?? ""), 500);
  }

  return apiOk({ area: updated as WorkAreaRow });
}
