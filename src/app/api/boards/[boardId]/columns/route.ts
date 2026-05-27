import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ boardId: string }> };

async function assertBoardMember(userId: string, boardId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("board_members")
    .select("user_id")
    .eq("board_id", boardId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { boardId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError("Não autenticado", 401);
  if (!(await assertBoardMember(user.id, boardId))) {
    return apiError("Sem acesso", 403);
  }

  const admin = createSupabaseAdminClient();
  const { data: columns, error } = await admin
    .from("board_columns")
    .select("id, name, color, sort_order")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  if (error) {
    return apiError("Erro ao carregar colunas", 500);
  }

  return apiOk({ columns: columns ?? [] });
}
