"use client";

import type { TaskWithAssignee } from "@/lib/types/kanban";
import { TASK_PRIORITY_DOT_CLASS } from "@/lib/types/kanban";
import { cn } from "@/lib/utils/cn";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type TaskCardProps = {
  task: TaskWithAssignee;
  onClick: () => void;
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const assigneeLabel =
    task.assignee?.full_name?.trim() ||
    task.assignee?.email?.split("@")[0] ||
    null;

  const pri = task.priority;
  const dotClass =
    pri === "low" || pri === "medium" || pri === "high" || pri === "urgent"
      ? TASK_PRIORITY_DOT_CLASS[pri]
      : TASK_PRIORITY_DOT_CLASS.medium;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
      )}
    >
      <div className="flex items-start gap-2 justify-between">
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            dotClass
          )}
          title={pri ?? "medium"}
          aria-hidden
        />
        <span className="text-sm font-medium text-slate-800 line-clamp-2 flex-1">
          {task.title}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {due && (
          <span title="Prazo">
            {format(due, "dd MMM yy · HH:mm", { locale: ptBR })}
          </span>
        )}
        {assigneeLabel && (
          <span className={cn(!due && "mt-0")} title="Responsável">
            {assigneeLabel}
          </span>
        )}
        {task.work_area && (
          <span title="Área / centro de custo" className="text-slate-600">
            {task.work_area.code}
          </span>
        )}
      </div>
    </button>
  );
}
