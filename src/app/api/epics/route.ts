import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { createEpicSchema } from "@/modules/boards/lib/validators/epic";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { isMissingPublicTableError } from "@/modules/core/lib/supabase-migration";

export const dynamic = "force-dynamic";

async function assertBoardMember(
  userId: string,
  boardId: string
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("board_members")
    .select("user_id")
    .eq("board_id", boardId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = createEpicSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const { board_id, title, description } = parsed.data;

  if (!(await assertBoardMember(user.id, board_id))) {
    return apiError("Sem acesso a este projeto", 403);
  }

  const admin = createSupabaseAdminClient();
  const { data: board, error: bErr } = await admin
    .from("boards")
    .select("tenant_id")
    .eq("id", board_id)
    .single();

  if (bErr || !board) {
    return apiError("Projeto não encontrado", 404);
  }

  const { data: existing, error: listErr } = await admin
    .from("epics")
    .select("sort_order")
    .eq("board_id", board_id);

  if (listErr && isMissingPublicTableError(listErr.message, "epics")) {
    return apiError(
      'A tabela "epics" ainda não existe neste projeto Supabase. Aplique a migration (ex.: supabase/migrations/20260506120000_epics_nested_kanban.sql) ou execute `npx supabase db push`.',
      503
    );
  }
  if (listErr) {
    return apiError("Falha ao preparar projeto: " + listErr.message, 500);
  }

  const sort_order = (existing ?? []).reduce(
    (m, r) => Math.max(m, r.sort_order),
    0
  ) + 1000;

  const { data: epic, error: insErr } = await admin
    .from("epics")
    .insert({
      tenant_id: board.tenant_id,
      board_id,
      title,
      description,
      created_by: user.id,
      sort_order,
      is_default: false,
    })
    .select("id, tenant_id, board_id, title, description, created_by, sort_order, created_at, updated_at")
    .single();

  if (insErr) {
    if (isMissingPublicTableError(insErr.message, "epics")) {
      return apiError(
        'A tabela "epics" ainda não existe neste projeto Supabase. Aplique a migration (ex.: supabase/migrations/20260506120000_epics_nested_kanban.sql) ou execute `npx supabase db push`.',
        503
      );
    }
    return apiError("Falha ao criar projeto: " + insErr.message, 500);
  }
  if (!epic) {
    return apiError("Falha ao criar projeto", 500);
  }

  return apiOk({ epic }, 201);
}
