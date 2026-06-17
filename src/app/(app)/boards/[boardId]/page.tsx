import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { BoardKanban } from "@/components/kanban/board-kanban";
import { AppPage } from "@/shared/ui/app-page";
import type { TaskWithAssignee } from "@/modules/core/types/kanban";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardDetailPage({ params }: PageProps) {
  const { boardId } = await params;
  const supabase = await createServerSupabaseClient();

  const [boardRes, columnsRes, defaultEpicRes] = await Promise.all([
    supabase
      .from("boards")
      .select("id, name, description, color")
      .eq("id", boardId)
      .maybeSingle(),
    supabase
      .from("board_columns")
      .select("id, name, color, sort_order")
      .eq("board_id", boardId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("epics")
      .select("id")
      .eq("board_id", boardId)
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  const defaultEpicId = defaultEpicRes.data?.id ?? null;

  let tasksQuery = supabase
    .from("tasks")
    .select(
      `
        id,
        tenant_id,
        board_id,
        column_id,
        title,
        description,
        priority,
        due_date,
        assignee_id,
        area_id,
        created_by,
        sort_order,
        epic_id,
        is_completed,
        completed_at,
        created_at,
        updated_at,
        assignee:user_profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          email
        ),
        work_area:work_areas!tasks_area_id_fkey (
          id,
          code,
          name
        )
      `
    )
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  if (defaultEpicId) {
    tasksQuery = tasksQuery.eq("epic_id", defaultEpicId);
  } else {
    tasksQuery = tasksQuery.is("epic_id", null);
  }

  const tasksRes = await tasksQuery;

  if (boardRes.error || !boardRes.data) {
    notFound();
  }

  const board = boardRes.data;
  const columns = columnsRes.data ?? [];

  let initialTasks: TaskWithAssignee[] | undefined;
  if (!tasksRes.error && tasksRes.data) {
    initialTasks = tasksRes.data.map((row) => {
      const r = row as typeof row & {
        assignee: {
          id: string;
          full_name: string | null;
          email: string;
        } | null;
        work_area: { id: string; code: string; name: string } | null;
      };
      const { assignee, work_area, ...rest } = r;
      return {
        ...rest,
        assignee: assignee ?? null,
        work_area: work_area ?? null,
      };
    });
  }

  return (
    <AppPage
      backHref="/boards"
      backLabel="Tarefas"
      title={
        <span className="inline-flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: board.color ?? "#0f766e" }}
          />
          <span className="truncate">{board.name}</span>
        </span>
      }
      description={board.description ?? undefined}
      width="full"
      density="comfortable"
      className="min-h-0 flex flex-col"
    >
      <BoardKanban boardId={board.id} columns={columns} initialTasks={initialTasks} />
    </AppPage>
  );
}
