import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { updateTaskSchema, patchDueDate } from "@/modules/boards/lib/validators/task";
import { apiError, apiOk } from "@/modules/core/lib/http";
import type { TaskUpdate, TaskWithAssignee } from "@/modules/core/types/kanban";
import { notifyTaskAssigned } from "@/modules/boards/lib/notifications/task-assigned";
import { resolveAssigneeCadastroEmail } from "@/modules/boards/lib/notifications/resolve-assignee-email";
import {
  enrichTasksWithAssigneeAndArea,
  type TaskRowWithAreaEmbed,
} from "@/modules/boards/lib/utils/task-embed-map";
import { TASK_DETAIL_SELECT } from "@/modules/boards/lib/utils/task-select";
import { assertWorkAreaBelongsToTenant } from "@/modules/engenharia/lib/work-area";
import {
  othersRelativeOrderUnchanged,
  sortOrderBetween,
} from "@/modules/boards/lib/utils/kanban-reorder-permission";

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

async function hydrateTaskFromRow(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  row: Record<string, unknown>
): Promise<TaskWithAssignee> {
  const assigneeMap = new Map<string, NonNullable<TaskWithAssignee["assignee"]>>();
  const aid = row.assignee_id as string | null | undefined;
  if (aid) {
    const { data: ap } = await admin
      .from("user_profiles")
      .select("id, full_name, email")
      .eq("id", aid)
      .maybeSingle();
    if (ap) {
      assigneeMap.set(ap.id, {
        id: ap.id,
        full_name: ap.full_name,
        email: ap.email,
      });
    }
  }
  return enrichTasksWithAssigneeAndArea(
    [row as unknown as TaskRowWithAreaEmbed],
    assigneeMap
  )[0]!;
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
    .select(TASK_DETAIL_SELECT)
    .eq("id", taskId)
    .single();

  if (error || !task) {
    return apiError("Tarefa não encontrada", 404);
  }

  const full = await hydrateTaskFromRow(admin, task as unknown as Record<string, unknown>);
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
  const admin = createSupabaseAdminClient();

  const { data: beforeSnap } = await admin
    .from("tasks")
    .select("assignee_id")
    .eq("id", taskId)
    .maybeSingle();

  /** Reordenar / mudar coluna com validação (admin: tudo; membro: só tarefas que criou; não baralha ordem alheia). */
  if (p.insert_index !== undefined && p.column_id !== undefined) {
    if (
      p.title !== undefined ||
      p.description !== undefined ||
      p.priority !== undefined ||
      p.due_date !== undefined ||
      p.assignee_id !== undefined ||
      p.area_id !== undefined ||
      p.is_completed !== undefined
    ) {
      return apiError("Reordenação só pode incluir column_id e insert_index", 400);
    }

    const { data: col } = await admin
      .from("board_columns")
      .select("board_id")
      .eq("id", p.column_id)
      .maybeSingle();
    if (!col || col.board_id !== meta.board_id) {
      return apiError("Coluna inválida", 400);
    }

    const { data: taskRow, error: tErr } = await admin
      .from("tasks")
      .select("id, board_id, column_id, epic_id, created_by, sort_order")
      .eq("id", taskId)
      .single();

    if (tErr || !taskRow) {
      return apiError("Tarefa não encontrada", 404);
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isTenantAdmin = profile?.role === "admin";

    if (!isTenantAdmin && taskRow.created_by !== user.id) {
      return apiError("Sem permissão para mover ou reordenar esta tarefa", 403);
    }

    let destQuery = admin
      .from("tasks")
      .select("id, sort_order, created_by")
      .eq("board_id", meta.board_id)
      .eq("column_id", p.column_id);

    if (taskRow.epic_id === null) {
      destQuery = destQuery.is("epic_id", null);
    } else {
      destQuery = destQuery.eq("epic_id", taskRow.epic_id);
    }

    const { data: destRows, error: dErr } = await destQuery.order("sort_order", {
      ascending: true,
    });

    if (dErr) {
      return apiError("Falha ao ler coluna: " + dErr.message, 500);
    }

    const sorted = [...(destRows ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const beforeDestIds = sorted.map((r) => r.id);
    const without = sorted.filter((r) => r.id !== taskId);
    const idx = Math.min(Math.max(0, p.insert_index), without.length);
    const mergedIds = [
      ...without.slice(0, idx).map((r) => r.id),
      taskId,
      ...without.slice(idx).map((r) => r.id),
    ];

    const tasksById = new Map<
      string,
      { id: string; created_by: string; sort_order: number }
    >();
    for (const r of sorted) {
      tasksById.set(r.id, r);
    }
    tasksById.set(taskRow.id, taskRow);

    if (
      !isTenantAdmin &&
      !othersRelativeOrderUnchanged(
        beforeDestIds,
        mergedIds,
        tasksById,
        user.id
      )
    ) {
      return apiError(
        "Não é permitido alterar a ordem das tarefas dos outros utilizadores",
        403
      );
    }

    const pos = mergedIds.indexOf(taskId);
    const left = pos > 0 ? tasksById.get(mergedIds[pos - 1]!) : undefined;
    const right =
      pos >= 0 && pos < mergedIds.length - 1
        ? tasksById.get(mergedIds[pos + 1]!)
        : undefined;

    const newSort = sortOrderBetween(left, right);

    const { data: updated, error: upErr } = await admin
      .from("tasks")
      .update({ column_id: p.column_id, sort_order: newSort })
      .eq("id", taskId)
      .select(TASK_DETAIL_SELECT)
      .single();

    if (upErr || !updated) {
      return apiError("Falha ao atualizar: " + (upErr?.message ?? ""), 500);
    }

    const full = await hydrateTaskFromRow(admin, updated as unknown as Record<string, unknown>);
    return apiOk({ task: full });
  }

  if (
    p.title === undefined &&
    p.description === undefined &&
    p.priority === undefined &&
    p.due_date === undefined &&
    p.assignee_id === undefined &&
    p.column_id === undefined &&
    p.area_id === undefined &&
    p.is_completed === undefined
  ) {
    return apiError("Nada para atualizar", 400);
  }

  if (p.column_id !== undefined) {
    const { data: col } = await admin
      .from("board_columns")
      .select("board_id")
      .eq("id", p.column_id)
      .maybeSingle();
    if (!col || col.board_id !== meta.board_id) {
      return apiError("Coluna inválida", 400);
    }

    const { data: mover } = await admin
      .from("tasks")
      .select("created_by")
      .eq("id", taskId)
      .maybeSingle();
    const { data: actorProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      actorProfile?.role !== "admin" &&
      mover?.created_by !== user.id
    ) {
      return apiError("Sem permissão para mover esta tarefa", 403);
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

  if (p.area_id !== undefined && p.area_id !== null) {
    if (
      !(await assertWorkAreaBelongsToTenant(admin, p.area_id, meta.tenant_id))
    ) {
      return apiError("Área / centro de custo inválido ou inativo", 400);
    }
  }

  const updateRow: TaskUpdate = {};
  if (p.title !== undefined) updateRow.title = p.title;
  if (p.description !== undefined) updateRow.description = p.description;
  if (p.priority !== undefined) updateRow.priority = p.priority;
  if (p.column_id !== undefined) updateRow.column_id = p.column_id;
  if (p.assignee_id !== undefined) updateRow.assignee_id = p.assignee_id;
  if (p.area_id !== undefined) updateRow.area_id = p.area_id;
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
    .select(TASK_DETAIL_SELECT)
    .single();

  if (upErr || !updated) {
    return apiError("Falha ao atualizar: " + (upErr?.message ?? ""), 500);
  }

  const full = await hydrateTaskFromRow(admin, updated as unknown as Record<string, unknown>);

  if (
    p.assignee_id !== undefined &&
    beforeSnap?.assignee_id !== updated.assignee_id &&
    updated.assignee_id
  ) {
    const toEmail = await resolveAssigneeCadastroEmail(
      admin,
      updated.assignee_id,
      full.assignee?.email
    );
    if (toEmail) {
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
        boardName: boardRow?.name ?? "Projeto",
        taskId: updated.id,
        taskTitle: updated.title,
        taskDescription: updated.description,
        assigneeEmail: toEmail,
        assigneeName: full.assignee?.full_name ?? null,
        creatorName: creator?.full_name?.trim() || creator?.email || null,
      });
    }
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
