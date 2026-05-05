import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateTaskSchema, patchDueDate } from "@/lib/validators/task";
import { apiError, apiOk } from "@/lib/http";
import type { TaskUpdate, TaskWithAssignee } from "@/lib/types/kanban";
import { notifyTaskAssigned } from "@/lib/notifications/task-assigned";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

async function loadTaskWithBoard(
  taskId: string
): Promise<{ board_id: string; tenant_id: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .select("board_id, tenant_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

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

async function attachAssignee(task: TaskWithAssignee): Promise<TaskWithAssignee> {
  if (!task.assignee_id) {
    return { ...task, assignee: null };
  }
  const admin = createSupabaseAdminClient();
  const { data: ap } = await admin
    .from("user_profiles")
    .select("id, full_name, email")
    .eq("id", task.assignee_id)
    .maybeSingle();
  return {
    ...task,
    assignee: ap
      ? { id: ap.id, full_name: ap.full_name, email: ap.email }
      : null,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: taskId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const meta = await loadTaskWithBoard(taskId);
  if (!meta) {
    return apiError("Tarefa não encontrada", 404);
  }

  if (!(await assertBoardMember(user.id, meta.board_id))) {
    return apiError("Sem acesso", 403);
  }

  const admin = createSupabaseAdminClient();
  const { data: task, error } = await admin
    .from("tasks")
    .select(
      "id, tenant_id, board_id, column_id, title, description, priority, due_date, assignee_id, created_by, sort_order, is_completed, completed_at, created_at, updated_at"
    )
    .eq("id", taskId)
    .single();

  if (error || !task) {
    return apiError("Tarefa não encontrada", 404);
  }

  const full = await attachAssignee(task as TaskWithAssignee);
  return apiOk({ task: full });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: taskId } = await params;
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

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const meta = await loadTaskWithBoard(taskId);
  if (!meta) {
    return apiError("Tarefa não encontrada", 404);
  }

  if (!(await assertBoardMember(user.id, meta.board_id))) {
    return apiError("Sem acesso", 403);
  }

  const p = parsed.data;
  if (
    p.title === undefined &&
    p.description === undefined &&
    p.priority === undefined &&
    p.due_date === undefined &&
    p.assignee_id === undefined &&
    p.column_id === undefined &&
    p.is_completed === undefined
  ) {
    return apiError("Nada para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: beforeSnap } = await admin
    .from("tasks")
    .select("assignee_id")
    .eq("id", taskId)
    .maybeSingle();

  if (p.column_id !== undefined) {
    const { data: col } = await admin
      .from("board_columns")
      .select("board_id")
      .eq("id", p.column_id)
      .maybeSingle();
    if (!col || col.board_id !== meta.board_id) {
      return apiError("Coluna inválida", 400);
    }
  }

  if (p.assignee_id !== undefined && p.assignee_id !== null) {
    const { data: assignee } = await admin
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", p.assignee_id)
      .maybeSingle();
    if (!assignee || assignee.tenant_id !== meta.tenant_id) {
      return apiError("Responsável inválido", 400);
    }
  }

  const updateRow: TaskUpdate = {};
  if (p.title !== undefined) updateRow.title = p.title;
  if (p.description !== undefined) updateRow.description = p.description;
  if (p.priority !== undefined) updateRow.priority = p.priority;
  if (p.column_id !== undefined) updateRow.column_id = p.column_id;
  if (p.assignee_id !== undefined) updateRow.assignee_id = p.assignee_id;
  if (p.is_completed !== undefined) updateRow.is_completed = p.is_completed;

  const duePatch = patchDueDate(p.due_date);
  if (duePatch !== undefined) {
    updateRow.due_date = duePatch;
  }

  if (p.is_completed === true) {
    updateRow.completed_at = new Date().toISOString();
  }
  if (p.is_completed === false) {
    updateRow.completed_at = null;
  }

  const { data: updated, error: upErr } = await admin
    .from("tasks")
    .update(updateRow)
    .eq("id", taskId)
    .select(
      "id, tenant_id, board_id, column_id, title, description, priority, due_date, assignee_id, created_by, sort_order, is_completed, completed_at, created_at, updated_at"
    )
    .single();

  if (upErr || !updated) {
    return apiError("Falha ao atualizar: " + (upErr?.message ?? ""), 500);
  }

  const full = await attachAssignee(updated as TaskWithAssignee);

  if (
    p.assignee_id !== undefined &&
    full.assignee?.email &&
    beforeSnap?.assignee_id !== updated.assignee_id &&
    updated.assignee_id
  ) {
    const { data: boardRow } = await admin
      .from("boards")
      .select("name")
      .eq("id", meta.board_id)
      .maybeSingle();
    const { data: creator } = await admin
      .from("user_profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    void notifyTaskAssigned({
      boardId: meta.board_id,
      boardName: boardRow?.name ?? "Quadro",
      taskId: updated.id,
      taskTitle: updated.title,
      taskDescription: updated.description,
      assigneeEmail: full.assignee.email,
      assigneeName: full.assignee.full_name,
      creatorName: creator?.full_name?.trim() || creator?.email || null,
    });
  }

  return apiOk({ task: full });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id: taskId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const meta = await loadTaskWithBoard(taskId);
  if (!meta) {
    return apiError("Tarefa não encontrada", 404);
  }

  if (!(await assertBoardMember(user.id, meta.board_id))) {
    return apiError("Sem acesso", 403);
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("tasks").delete().eq("id", taskId);

  if (error) {
    return apiError("Falha ao excluir: " + error.message, 500);
  }

  return apiOk({ ok: true });
}
