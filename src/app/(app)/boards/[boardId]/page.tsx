import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BoardKanban } from "@/components/kanban/board-kanban";
import type { TaskWithAssignee } from "@/lib/types/kanban";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardDetailPage({ params }: PageProps) {
  const { boardId } = await params;
  const supabase = await createServerSupabaseClient();

  const [boardRes, columnsRes, tasksRes] = await Promise.all([
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
        created_by,
        sort_order,
        is_completed,
        completed_at,
        created_at,
        updated_at,
        assignee:user_profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          email
        )
      `
      )
      .eq("board_id", boardId)
      .order("sort_order", { ascending: true }),
  ]);

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
      };
      const { assignee, ...rest } = r;
      return {
        ...rest,
        assignee: assignee ?? null,
      };
    });
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/boards"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Quadros
          </Link>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: board.color ?? "#0f766e" }}
            />
            <h2 className="text-2xl font-semibold text-slate-900 truncate">
              {board.name}
            </h2>
          </div>
          {board.description ? (
            <p className="text-sm text-slate-500 mt-1">{board.description}</p>
          ) : null}
        </div>
      </div>

      <BoardKanban boardId={board.id} columns={columns} initialTasks={initialTasks} />
    </div>
  );
}
