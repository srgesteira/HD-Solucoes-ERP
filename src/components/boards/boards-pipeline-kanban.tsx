"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useTasksPipeline } from "@/hooks/use-tasks-pipeline";
import type { PipelineTask } from "@/lib/types/pipeline";
import { TASK_PRIORITY_DOT_CLASS } from "@/lib/types/kanban";
import { cn } from "@/lib/utils/cn";

function dotClass(priority: string | null): string {
  const p = priority;
  if (p === "low" || p === "medium" || p === "high" || p === "urgent") {
    return TASK_PRIORITY_DOT_CLASS[p];
  }
  return TASK_PRIORITY_DOT_CLASS.medium;
}

function PipelineCard({ task }: { task: PipelineTask }) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const who =
    task.assignee?.full_name?.trim() ||
    task.assignee?.email?.split("@")[0] ||
    null;

  return (
    <Link
      href={`/boards/${task.board_id}`}
      className={cn(
        "block rounded-md border border-slate-200 bg-white p-2.5 shadow-sm transition",
        "hover:border-slate-300 hover:shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotClass(task.priority))}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 line-clamp-2">{task.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate" title={task.board_name}>
            {task.board_name}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
            {due ? (
              <span>{format(due, "dd MMM HH:mm", { locale: ptBR })}</span>
            ) : null}
            {who ? <span>{who}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BoardsPipelineKanban() {
  const { data, isLoading, error } = useTasksPipeline(true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar execução…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-red-600 py-4">
        {error?.message ?? "Não foi possível carregar o painel de execução."}
      </p>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Execução (3 etapas)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.visibility === "tenant_admin"
              ? "Administrador: vê todas as tarefas do tenant."
              : "Vê tarefas que criou, onde é responsável ou em que foi @mencionado na descrição."}
          </p>
        </div>
      </div>

      <div className="kanban-scroll flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {data.stages.map((stage) => (
          <div
            key={stage.index}
            className="w-[min(100%,280px)] sm:w-72 shrink-0 flex flex-col rounded-lg bg-slate-100/80 border border-slate-200/80 p-3 max-h-[min(70vh,520px)]"
          >
            <div className="flex items-center gap-2 shrink-0 mb-2 pb-2 border-b border-slate-200/80">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: stage.color }}
                aria-hidden
              />
              <h4 className="font-medium text-slate-800 text-sm">{stage.label}</h4>
              <span className="text-xs text-slate-500">{stage.tasks.length}</span>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto kanban-scroll pr-0.5">
              {stage.tasks.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhuma tarefa</p>
              ) : (
                stage.tasks.map((t) => <PipelineCard key={t.id} task={t} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
