import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
      .select("id, title, column_id, sort_order, priority, due_date")
      .eq("board_id", boardId)
      .order("sort_order", { ascending: true }),
  ]);

  if (boardRes.error || !boardRes.data) {
    notFound();
  }

  const board = boardRes.data;
  const columns = columnsRes.data ?? [];
  const tasks = tasksRes.data ?? [];

  const tasksByColumn = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const list = tasksByColumn.get(t.column_id) ?? [];
    list.push(t);
    tasksByColumn.set(t.column_id, list);
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

      <div className="kanban-scroll flex-1 flex gap-4 overflow-x-auto pb-3">
        {columns.length === 0 ? (
          <p className="text-sm text-slate-500">Este quadro ainda não tem colunas.</p>
        ) : (
          columns.map((col) => {
            const colTasks = tasksByColumn.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col gap-2 rounded-lg bg-slate-100/70 p-3"
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: col.color ?? "#64748b" }}
                    />
                    <h3 className="font-medium text-slate-800 text-sm truncate">
                      {col.name}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed"
                    title="Adicionar tarefa (próximo sprint)"
                    aria-label="Adicionar tarefa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-2 min-h-[60px]">
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic px-1">
                      Sem tarefas
                    </p>
                  ) : (
                    colTasks.map((task) => (
                      <article
                        key={task.id}
                        className="rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {task.title}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="text-xs text-slate-400 text-center pt-2 border-t border-slate-200">
        Drag-and-drop, criação rápida e detalhes da tarefa virão nos próximos sprints.
      </div>
    </div>
  );
}
