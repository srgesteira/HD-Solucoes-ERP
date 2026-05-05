import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTaskSchema } from "@/lib/validators/task";
import { nextSortOrderForColumn } from "@/lib/utils/kanban-helpers";
import { apiError, apiOk } from "@/lib/http";
import type { TaskWithAssignee } from "@/lib/types/kanban";
import { notifyTaskAssigned } from "@/lib/notifications/task-assigned";
import { resolveAssigneeCadastroEmail } from "@/lib/notifications/resolve-assignee-email";

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

/**
 * GET /api/tasks?board_id=uuid — lista tarefas do quadro com assignee resolvido.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const boardId = request.nextUrl.searchParams.get("board_id")?.trim();
  if (!boardId) {
    return apiError("Parâmetro board_id obrigatório", 400);
  }

  if (!(await assertBoardMember(user.id, boardId))) {
    return apiError("Sem acesso a este quadro", 403);
  }

  const admin = createSupabaseAdminClient();
  const { data: tasks, error: tErr } = await admin
    .from("tasks")
    .select(
      "id, tenant_id, board_id, column_id, title, description, priority, due_date, assignee_id, created_by, sort_order, is_completed, completed_at, created_at, updated_at"
    )
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  if (tErr) {
    return apiError("Falha ao carregar tarefas: " + tErr.message, 500);
  }

  const list = tasks ?? [];
  const assigneeIds = [
    ...new Set(
      list.map((t) => t.assignee_id).filter((id): id is string => !!id)
    ),
  ];

  let assigneeMap = new Map<
    string,
    { id: string; full_name: string | null; email: string }
  >();

  if (assigneeIds.length > 0) {
    const { data: profiles, error: pErr } = await admin
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", assigneeIds);

    if (pErr) {
      return apiError("Falha ao carregar responsáveis: " + pErr.message, 500);
    }
    assigneeMap = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        { id: p.id, full_name: p.full_name, email: p.email },
      ])
    );
  }

  const out: TaskWithAssignee[] = list.map((t) => ({
    ...t,
    assignee: t.assignee_id ? assigneeMap.get(t.assignee_id) ?? null : null,
  }));

  return apiOk({ tasks: out });
}

/**
 * POST /api/tasks — cria tarefa na coluna (sort_order no fim da coluna).
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
    return apiError("Body inválido", 400);
  }

  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const { board_id, column_id, title, description, priority, due_date, assignee_id } =
    parsed.data;

  if (!(await assertBoardMember(user.id, board_id))) {
    return apiError("Sem acesso a este quadro", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: board, error: bErr } = await admin
    .from("boards")
    .select("id, tenant_id, name")
    .eq("id", board_id)
    .single();

  if (bErr || !board) {
    return apiError("Quadro não encontrado", 404);
  }

  const { data: col, error: cErr } = await admin
    .from("board_columns")
    .select("id, board_id")
    .eq("id", column_id)
    .single();

  if (cErr || !col || col.board_id !== board_id) {
    return apiError("Coluna inválida para este quadro", 400);
  }

  if (assignee_id) {
    const { data: assignee } = await admin
      .from("user_profiles")
      .select("id, tenant_id")
      .eq("id", assignee_id)
      .maybeSingle();
    if (!assignee || assignee.tenant_id !== board.tenant_id) {
      return apiError("Responsável inválido (outro tenant)", 400);
    }
  }

  const { data: colTasks, error: ctErr } = await admin
    .from("tasks")
    .select("sort_order")
    .eq("column_id", column_id);

  if (ctErr) {
    return apiError("Falha ao calcular ordem: " + ctErr.message, 500);
  }

  const sort_order = nextSortOrderForColumn(colTasks ?? []);

  const { data: task, error: insErr } = await admin
    .from("tasks")
    .insert({
      tenant_id: board.tenant_id,
      board_id,
      column_id,
      title,
      description,
      priority,
      due_date,
      assignee_id: assignee_id ?? null,
      created_by: user.id,
      sort_order,
    })
    .select(
      "id, tenant_id, board_id, column_id, title, description, priority, due_date, assignee_id, created_by, sort_order, is_completed, completed_at, created_at, updated_at"
    )
    .single();

  if (insErr || !task) {
    return apiError(
      "Falha ao criar tarefa: " + (insErr?.message ?? "desconhecido"),
      500
    );
  }

  let assignee: TaskWithAssignee["assignee"] = null;
  if (task.assignee_id) {
    const { data: ap } = await admin
      .from("user_profiles")
      .select("id, full_name, email")
      .eq("id", task.assignee_id)
      .maybeSingle();
    assignee = ap
      ? { id: ap.id, full_name: ap.full_name, email: ap.email }
      : null;
  }

  const full: TaskWithAssignee = { ...task, assignee };

  if (task.assignee_id) {
    const toEmail = await resolveAssigneeCadastroEmail(
      admin,
      task.assignee_id,
      assignee?.email
    );
    if (toEmail) {
      const { data: creator } = await admin
        .from("user_profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      void notifyTaskAssigned({
        boardId: board_id,
        boardName: board.name,
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        assigneeEmail: toEmail,
        assigneeName: assignee?.full_name ?? null,
        creatorName: creator?.full_name?.trim() || creator?.email || null,
      });
    }
  }

  return apiOk({ task: full }, 201);
}
