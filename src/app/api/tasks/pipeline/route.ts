import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { DEFAULT_COLUMNS } from "@/lib/types/kanban";
import type { PipelineTask } from "@/lib/types/pipeline";
import type { PipelineStageIndex } from "@/lib/utils/task-pipeline";
import {
  columnRankInBoard,
  descriptionMentionsUser,
  stageIndexFromColumnRank,
  stageLabel,
} from "@/lib/utils/task-pipeline";

export type { PipelineTask } from "@/lib/types/pipeline";

/**
 * Visão de execução (3 etapas) para a lista de quadros.
 * — Admin do tenant (`user_profiles.role`): todas as tarefas do tenant.
 * — Demais: tarefas que criou, ou onde é responsável, ou onde foi @mencionado na descrição.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const admin = createSupabaseAdminClient();

  const { data: profile, error: pErr } = await admin
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !profile?.tenant_id) {
    return apiError("Perfil não encontrado", 403);
  }

  const tenantId = profile.tenant_id;
  const isTenantAdmin = profile.role === "admin";

  const { data: boardsInTenant, error: bErr } = await admin
    .from("boards")
    .select("id")
    .eq("tenant_id", tenantId);

  if (bErr) {
    return apiError("Falha ao listar quadros", 500);
  }

  const boardIds = (boardsInTenant ?? []).map((b) => b.id);
  if (boardIds.length === 0) {
    return apiOk({
      stages: DEFAULT_COLUMNS.map((col, i) => ({
        index: i as PipelineStageIndex,
        label: col.name,
        color: col.color,
        tasks: [] as PipelineTask[],
      })),
      visibility: isTenantAdmin ? "tenant_admin" : "member_scope",
    });
  }

  const { data: taskRows, error: tErr } = await admin
    .from("tasks")
    .select(
      "id, title, board_id, column_id, priority, due_date, assignee_id, created_by, description, updated_at"
    )
    .in("board_id", boardIds)
    .order("updated_at", { ascending: false });

  if (tErr) {
    return apiError("Falha ao carregar tarefas: " + tErr.message, 500);
  }

  const tasks = taskRows ?? [];

  const { data: profileEmails } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("tenant_id", tenantId);

  const myEmail =
    profileEmails?.find((p) => p.id === user.id)?.email?.toLowerCase() ?? "";

  let visible = tasks;
  if (!isTenantAdmin) {
    visible = tasks.filter((t) => {
      if (t.created_by === user.id) return true;
      if (t.assignee_id === user.id) return true;
      if (myEmail && descriptionMentionsUser(t.description, myEmail))
        return true;
      return false;
    });
  }

  const { data: colRows } = await admin
    .from("board_columns")
    .select("id, board_id, sort_order")
    .in("board_id", boardIds);

  const columnsByBoard = new Map<string, { id: string; sort_order: number }[]>();
  for (const c of colRows ?? []) {
    const list = columnsByBoard.get(c.board_id) ?? [];
    list.push({ id: c.id, sort_order: c.sort_order });
    columnsByBoard.set(c.board_id, list);
  }

  const { data: boardsNamed } = await admin
    .from("boards")
    .select("id, name")
    .in("id", boardIds);

  const boardNameById = new Map(
    (boardsNamed ?? []).map((b) => [b.id, b.name as string])
  );

  const assigneeIds = [
    ...new Set(
      visible.map((t) => t.assignee_id).filter((id): id is string => !!id)
    ),
  ];

  let assigneeMap = new Map<
    string,
    { id: string; full_name: string | null; email: string }
  >();

  if (assigneeIds.length > 0) {
    const { data: aps } = await admin
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", assigneeIds);
    assigneeMap = new Map(
      (aps ?? []).map((p) => [
        p.id,
        { id: p.id, full_name: p.full_name, email: p.email },
      ])
    );
  }

  const pipelineTasks: PipelineTask[] = visible.map((t) => {
    const rank = columnRankInBoard(t.board_id, t.column_id, columnsByBoard);
    const stage = stageIndexFromColumnRank(rank);
    const asn = t.assignee_id ? assigneeMap.get(t.assignee_id) ?? null : null;
    return {
      id: t.id,
      title: t.title,
      board_id: t.board_id,
      board_name: boardNameById.get(t.board_id) ?? "Quadro",
      column_id: t.column_id,
      priority: t.priority,
      due_date: t.due_date,
      assignee_id: t.assignee_id,
      created_by: t.created_by,
      stage,
      assignee: asn,
    };
  });

  const stages: {
    index: PipelineStageIndex;
    label: string;
    color: string;
    tasks: PipelineTask[];
  }[] = [0, 1, 2].map((i) => ({
    index: i as PipelineStageIndex,
    label: stageLabel(i as PipelineStageIndex),
    color: DEFAULT_COLUMNS[i]?.color ?? "#64748b",
    tasks: pipelineTasks.filter((x) => x.stage === i),
  }));

  return apiOk({
    stages,
    visibility: isTenantAdmin ? "tenant_admin" : "member_scope",
  });
}
