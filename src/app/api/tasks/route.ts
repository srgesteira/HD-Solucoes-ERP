import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { createTaskSchema } from "@/modules/boards/lib/validators/task";
import { nextSortOrderForColumn } from "@/modules/boards/lib/utils/kanban-helpers";
import { apiError, apiOk } from "@/modules/core/lib/http";
import type { TaskWithAssignee } from "@/modules/core/types/kanban";
import { notifyTaskAssigned } from "@/modules/boards/lib/notifications/task-assigned";
import { resolveAssigneeCadastroEmail } from "@/modules/boards/lib/notifications/resolve-assignee-email";
import { getDefaultEpicIdForBoard } from "@/modules/boards/lib/utils/board-epic";
import { TASK_DETAIL_SELECT } from "@/modules/boards/lib/utils/task-select";
import {
  enrichTasksWithAssigneeAndArea,
  type TaskRowWithAreaEmbed,
} from "@/modules/boards/lib/utils/task-embed-map";
import { assertWorkAreaBelongsToTenant } from "@/modules/engenharia/lib/work-area";

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
 * GET /api/tasks?board_id=uuid — lista tarefas do projeto com assignee resolvido.
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
  const epicId = request.nextUrl.searchParams.get("epic_id")?.trim() ?? null;

  if (!boardId) {
    return apiError("Parâmetro board_id obrigatório", 400);
  }

  if (!(await assertBoardMember(user.id, boardId))) {
    return apiError("Sem acesso a este projeto", 403);
  }

  const admin = createSupabaseAdminClient();
  const defaultEpicId = await getDefaultEpicIdForBoard(admin, boardId);

  let taskQuery = admin
    .from("tasks")
    .select(TASK_DETAIL_SELECT)
    .eq("board_id", boardId);

  if (epicId) {
    taskQuery = taskQuery.eq("epic_id", epicId);
  } else if (defaultEpicId) {
    /** Vista interna: tarefas do projeto principal (alimenta o Kanban global). */
    taskQuery = taskQuery.eq("epic_id", defaultEpicId);
  } else {
    taskQuery = taskQuery.is("epic_id", null);
  }

  const { data: tasks, error: tErr } = await taskQuery.order("sort_order", {
    ascending: true,
  });

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

  const out: TaskWithAssignee[] = enrichTasksWithAssigneeAndArea(
    list as unknown as TaskRowWithAreaEmbed[],
    assigneeMap
  );

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

  const {
    board_id,
    column_id,
    title,
    description,
    priority,
    due_date,
    assignee_id,
    epic_id,
    area_id,
  } = parsed.data;

  if (!(await assertBoardMember(user.id, board_id))) {
    return apiError("Sem acesso a este projeto", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: board, error: bErr } = await admin
    .from("boards")
    .select("id, tenant_id, name")
    .eq("id", board_id)
    .single();

  if (bErr || !board) {
    return apiError("Projeto não encontrado", 404);
  }

  const { data: col, error: cErr } = await admin
    .from("board_columns")
    .select("id, board_id")
    .eq("id", column_id)
    .single();

  if (cErr || !col || col.board_id !== board_id) {
    return apiError("Coluna inválida para este projeto", 400);
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

  let resolvedEpicId = epic_id ?? null;
  if (!resolvedEpicId) {
    const primary = await getDefaultEpicIdForBoard(admin, board_id);
    if (primary) resolvedEpicId = primary;
  }

  if (resolvedEpicId) {
    const { data: epicRow } = await admin
      .from("epics")
      .select("id, board_id")
      .eq("id", resolvedEpicId)
      .maybeSingle();
    if (!epicRow || epicRow.board_id !== board_id) {
      return apiError("Épico inválido para este projeto", 400);
    }
  }

  let resolvedAreaId = area_id ?? null;
  if (resolvedAreaId) {
    if (
      !(await assertWorkAreaBelongsToTenant(
        admin,
        resolvedAreaId,
        board.tenant_id
      ))
    ) {
      return apiError("Área / centro de custo inválido ou inativo", 400);
    }
  }

  let colTasksQuery = admin
    .from("tasks")
    .select("sort_order")
    .eq("column_id", column_id);
  if (resolvedEpicId) {
    colTasksQuery = colTasksQuery.eq("epic_id", resolvedEpicId);
  } else {
    colTasksQuery = colTasksQuery.is("epic_id", null);
  }

  const { data: colTasks, error: ctErr } = await colTasksQuery;

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
      epic_id: resolvedEpicId,
      area_id: resolvedAreaId,
      created_by: user.id,
      sort_order,
    })
    .select(TASK_DETAIL_SELECT)
    .single();

  if (insErr || !task) {
    return apiError(
      "Falha ao criar tarefa: " + (insErr?.message ?? "desconhecido"),
      500
    );
  }

  let assigneeMap = new Map<string, NonNullable<TaskWithAssignee["assignee"]>>();
  if (task.assignee_id) {
    const { data: ap } = await admin
      .from("user_profiles")
      .select("id, full_name, email")
      .eq("id", task.assignee_id)
      .maybeSingle();
    if (ap) {
      assigneeMap.set(ap.id, {
        id: ap.id,
        full_name: ap.full_name,
        email: ap.email,
      });
    }
  }

  const full = enrichTasksWithAssigneeAndArea(
    [task as unknown as TaskRowWithAreaEmbed],
    assigneeMap
  )[0]!;

  if (task.assignee_id) {
    const assigneeProfile = assigneeMap.get(task.assignee_id);
    const toEmail = await resolveAssigneeCadastroEmail(
      admin,
      task.assignee_id,
      assigneeProfile?.email
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
        assigneeName: assigneeProfile?.full_name ?? null,
        creatorName: creator?.full_name?.trim() || creator?.email || null,
      });
    }
  }

  return apiOk({ task: full }, 201);
}
