"use client";

import type { BoardColumn } from "@/lib/types/kanban";
import type { TaskWithAssignee } from "@/lib/types/kanban";
import { TaskCard } from "@/components/kanban/task-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ColumnProps = {
  column: Pick<BoardColumn, "id" | "name" | "color">;
  tasks: TaskWithAssignee[];
  onOpenTask: (task: TaskWithAssignee) => void;
  onBeginCreate: (columnId: string, initialTitle: string) => void;
};

export function KanbanColumn({
  column,
  tasks,
  onOpenTask,
  onBeginCreate,
}: ColumnProps) {
  return (
    <div className="w-72 shrink-0 flex flex-col gap-2 rounded-lg bg-slate-100/70 p-3 max-h-[calc(100vh-12rem)]">
      <div className="flex items-center justify-between gap-2 px-1 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: column.color ?? "#64748b" }}
          />
          <h3 className="font-medium text-slate-800 text-sm truncate">
            {column.name}
          </h3>
          <span className="text-xs text-slate-500">{tasks.length}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto kanban-scroll pr-0.5">
        {tasks.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-1">Sem tarefas</p>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onOpenTask(task)} />
          ))
        )}
      </div>

      <form
        className="shrink-0 pt-1 border-t border-slate-200/80 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const title = String(fd.get("title") ?? "").trim();
          onBeginCreate(column.id, title);
          form.reset();
        }}
      >
        <label className="sr-only" htmlFor={`quick-title-${column.id}`}>
          Nova tarefa em {column.name}
        </label>
        <div className="flex gap-2">
          <Input
            id={`quick-title-${column.id}`}
            name="title"
            placeholder="Título da tarefa…"
            autoComplete="off"
            className="text-sm"
          />
          <Button
            type="submit"
            size="sm"
            aria-label={`Abrir nova tarefa em ${column.name}`}
            title="Abrir formulário com descrição e responsável"
          >
            +
          </Button>
        </div>
      </form>
    </div>
  );
}
