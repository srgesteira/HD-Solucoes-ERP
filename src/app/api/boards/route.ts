import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createBoardSchema } from "@/lib/validators/board";
import { apiError, apiOk } from "@/lib/http";
import { DEFAULT_COLUMNS, type BoardSummary } from "@/lib/types/kanban";

export const dynamic = "force-dynamic";

/**
 * GET /api/boards — lista os boards onde o usuário logado é membro.
 * Retorna { boards: BoardSummary[] } com contagem de tasks/colunas e papel
 * do usuário no board.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  /** Lê via cliente do user (RLS já filtra para boards onde é membro). */
  const { data: memberships, error: memErr } = await supabase
    .from("board_members")
    .select(
      `
      role,
      boards (
        id,
        tenant_id,
        name,
        description,
        color,
        icon,
        is_archived,
        created_by,
        sort_order,
        created_at,
        updated_at
      )
    `
    )
    .eq("user_id", user.id);

  if (memErr) {
    return apiError("Falha ao listar quadros: " + memErr.message, 500);
  }

  const boardsRaw = (memberships ?? [])
    .filter((m) => m.boards && !m.boards.is_archived)
    .map((m) => ({ ...m.boards!, member_role: m.role as BoardSummary["member_role"] }));

  if (boardsRaw.length === 0) {
    return apiOk({ boards: [] as BoardSummary[] });
  }

  const boardIds = boardsRaw.map((b) => b.id);

  /** Contagens em paralelo — um RPC seria melhor mas evita criar mais SQL agora. */
  const [tasksCounts, columnsCounts] = await Promise.all([
    supabase
      .from("tasks")
      .select("board_id", { count: "exact", head: false })
      .in("board_id", boardIds),
    supabase
      .from("board_columns")
      .select("board_id", { count: "exact", head: false })
      .in("board_id", boardIds),
  ]);

  const taskCountByBoard = new Map<string, number>();
  for (const row of tasksCounts.data ?? []) {
    taskCountByBoard.set(row.board_id, (taskCountByBoard.get(row.board_id) ?? 0) + 1);
  }
  const columnCountByBoard = new Map<string, number>();
  for (const row of columnsCounts.data ?? []) {
    columnCountByBoard.set(
      row.board_id,
      (columnCountByBoard.get(row.board_id) ?? 0) + 1
    );
  }

  const boards: BoardSummary[] = boardsRaw
    .map((b) => ({
      ...b,
      task_count: taskCountByBoard.get(b.id) ?? 0,
      column_count: columnCountByBoard.get(b.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );

  return apiOk({ boards });
}

/**
 * POST /api/boards — cria um novo board e popula com 3 colunas padrão.
 * Body: { name, description?, color?, icon? } — validado por Zod.
 */
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
    return apiError("Body inválido (JSON esperado)", 400);
  }

  const parsed = createBoardSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  /** O profile precisa existir antes de o user criar boards (FK em created_by). */
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("id, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return apiError("Falha ao carregar perfil: " + profileErr.message, 500);
  }
  if (!profile) {
    return apiError(
      "Seu perfil de usuário ainda não foi criado. Faça logout/login uma vez para que o trigger crie automaticamente.",
      409
    );
  }

  /**
   * Inserção do board (o trigger trg_board_add_owner cria a board_membership).
   * O cliente do usuário respeita RLS — `created_by = auth.uid()`.
   */
  const { data: created, error: insertErr } = await supabase
    .from("boards")
    .insert({
      tenant_id: profile.tenant_id,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color,
      icon: parsed.data.icon ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertErr || !created) {
    return apiError(
      "Falha ao criar quadro: " + (insertErr?.message ?? "desconhecido"),
      500
    );
  }

  /**
   * Colunas padrão. Usa cliente admin para escapar de qualquer race com a
   * propagação de board_membership (o trigger já rodou, mas RLS pode demorar
   * a ver dependendo do isolation level).
   */
  const admin = createSupabaseAdminClient();
  const { error: colErr } = await admin.from("board_columns").insert(
    DEFAULT_COLUMNS.map((c) => ({
      board_id: created.id,
      name: c.name,
      color: c.color,
      sort_order: c.sort_order,
    }))
  );

  if (colErr) {
    /** Rollback: remove o board recém-criado para deixar o estado consistente. */
    await admin.from("boards").delete().eq("id", created.id);
    return apiError("Falha ao criar colunas padrão: " + colErr.message, 500);
  }

  return apiOk({ board: created }, 201);
}
