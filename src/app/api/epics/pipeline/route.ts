import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { DEFAULT_COLUMNS } from "@/lib/types/kanban";
import type { EpicPipelineItem, EpicsPipelineResponse } from "@/lib/types/epic-pipeline";
import { columnRankInBoard } from "@/lib/utils/task-pipeline";
import { epicOuterBucketFromRanks } from "@/lib/utils/epic-outer-stage";
import { subtaskVisibleToMember } from "@/lib/utils/task-visibility";
import { isMissingPublicTableError } from "@/lib/utils/supabase-migration";

export const dynamic = "force-dynamic";

/**
 * Painel de épicos (UTA): 2 colunas ativas + lista de finalizados.
 * Regras de visibilidade alinhadas ao antigo pipeline de tarefas.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRole) {
    return apiError(
      "Configure SUPABASE_SERVICE_ROLE_KEY na Vercel (Project → Settings → Environment Variables). Use a chave «service_role» em Supabase → Project Settings → API. Ela fica só no servidor; o painel de projetos depende dela.",
      500
    );
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

  const { data: epicsRaw, error: eErr } = await admin
    .from("epics")
    .select("id, title, description, board_id, created_by, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (eErr) {
    if (isMissingPublicTableError(eErr.message, "epics")) {
      const body: EpicsPipelineResponse = {
        columns: [
          {
            key: "todo",
            label: DEFAULT_COLUMNS[0]!.name,
            color: DEFAULT_COLUMNS[0]!.color,
            epics: [],
          },
          {
            key: "in_progress",
            label: DEFAULT_COLUMNS[1]!.name,
            color: DEFAULT_COLUMNS[1]!.color,
            epics: [],
          },
        ],
        finished: [],
        visibility: isTenantAdmin ? "tenant_admin" : "member_scope",
        migration_pending: true,
      };
      return apiOk(body);
    }
    return apiError("Falha ao carregar projetos: " + eErr.message, 500);
  }

  const { data: profileEmails } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("tenant_id", tenantId);

  const me = profileEmails?.find((p) => p.id === user.id);
  const myEmail = me?.email?.trim() ?? "";

  const boardIds = [...new Set((epicsRaw ?? []).map((e) => e.board_id))];
  const { data: boardsNamed } =
    boardIds.length > 0
      ? await admin.from("boards").select("id, name").in("id", boardIds)
      : { data: [] as { id: string; name: string }[] };

  const boardNameById = new Map(
    (boardsNamed ?? []).map((b) => [b.id, b.name as string])
  );

  const { data: colRows } =
    boardIds.length > 0
      ? await admin
          .from("board_columns")
          .select("id, board_id, sort_order")
          .in("board_id", boardIds)
      : { data: [] as { id: string; board_id: string; sort_order: number }[] };

  const columnsByBoard = new Map<string, { id: string; sort_order: number }[]>();
  const columnCountByBoard = new Map<string, number>();
  for (const c of colRows ?? []) {
    const list = columnsByBoard.get(c.board_id) ?? [];
    list.push({ id: c.id, sort_order: c.sort_order });
    columnsByBoard.set(c.board_id, list);
  }
  for (const bid of boardIds) {
    const n = (columnsByBoard.get(bid) ?? []).length;
    columnCountByBoard.set(bid, Math.max(n, 1));
  }

  type SubtaskRow = {
    id: string;
    epic_id: string | null;
    board_id: string;
    column_id: string;
    created_by: string;
    assignee_id: string | null;
    description: string | null;
  };

  const epicIds = (epicsRaw ?? []).map((e) => e.id);
  const { data: allSubtasksRaw } =
    epicIds.length > 0
      ? await admin
          .from("tasks")
          .select(
            "id, epic_id, board_id, column_id, created_by, assignee_id, description"
          )
          .in("epic_id", epicIds)
      : { data: [] as SubtaskRow[] };

  const allSubtasks = (allSubtasksRaw ?? []) as SubtaskRow[];

  const subsByEpic = new Map<string, SubtaskRow[]>();
  for (const s of allSubtasks) {
    const eid = s.epic_id;
    if (!eid) continue;
    const list = subsByEpic.get(eid) ?? [];
    list.push(s);
    subsByEpic.set(eid, list);
  }

  const visibleEpics: (NonNullable<typeof epicsRaw>[number])[] = [];

  for (const epic of epicsRaw ?? []) {
    const subs = subsByEpic.get(epic.id) ?? [];
    if (!isTenantAdmin && subs.length === 0 && epic.created_by !== user.id) {
      continue;
    }
    if (isTenantAdmin) {
      visibleEpics.push(epic);
      continue;
    }
    if (epic.created_by === user.id) {
      visibleEpics.push(epic);
      continue;
    }
    if (
      subs.length > 0 &&
      subs.some((t) =>
        subtaskVisibleToMember(
          {
            created_by: t.created_by as string,
            assignee_id: t.assignee_id as string | null,
            description: t.description as string | null,
          },
          user.id,
          myEmail
        )
      )
    ) {
      visibleEpics.push(epic);
    }
  }

  const items: EpicPipelineItem[] = visibleEpics.map((epic) => {
    const subs = subsByEpic.get(epic.id) ?? [];
    const bid = epic.board_id;
    const n = columnCountByBoard.get(bid) ?? 3;
    const ranks = subs.map((t) =>
      columnRankInBoard(
        t.board_id as string,
        t.column_id as string,
        columnsByBoard
      )
    );
    const bucket = epicOuterBucketFromRanks(ranks, n);
    return {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      board_id: epic.board_id,
      board_name: boardNameById.get(epic.board_id) ?? "Projeto",
      created_by: epic.created_by,
      subtask_count: subs.length,
      sort_order: epic.sort_order,
      bucket,
    };
  });

  const todo = items
    .filter((x) => x.bucket === "backlog")
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "pt-BR"));
  const inProgress = items
    .filter((x) => x.bucket === "active")
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "pt-BR"));
  const finished = items
    .filter((x) => x.bucket === "done")
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "pt-BR"));

  const body: EpicsPipelineResponse = {
    columns: [
      {
        key: "todo",
        label: DEFAULT_COLUMNS[0]!.name,
        color: DEFAULT_COLUMNS[0]!.color,
        epics: todo,
      },
      {
        key: "in_progress",
        label: DEFAULT_COLUMNS[1]!.name,
        color: DEFAULT_COLUMNS[1]!.color,
        epics: inProgress,
      },
    ],
    finished,
    visibility: isTenantAdmin ? "tenant_admin" : "member_scope",
  };

  return apiOk(body);
}
