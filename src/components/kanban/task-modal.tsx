"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import type { BoardColumn } from "@/lib/types/kanban";
import type { TaskWithAssignee, UserProfile } from "@/lib/types/kanban";
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/lib/types/kanban";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useDeleteTask, useUpdateTask } from "@/hooks/use-board-tasks";
import type { UpdateTaskInput } from "@/lib/validators/task";
import { X } from "lucide-react";

function isoToLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToIsoOrNull(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type TaskModalProps = {
  open: boolean;
  task: TaskWithAssignee | null;
  boardId: string;
  columns: Pick<BoardColumn, "id" | "name">[];
  tenantUsers: UserProfile[];
  onClose: () => void;
};

export function TaskModal({
  open,
  task,
  boardId,
  columns,
  tenantUsers,
  onClose,
}: TaskModalProps) {
  const updateTask = useUpdateTask(boardId);
  const deleteTask = useDeleteTask(boardId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [columnId, setColumnId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueLocal, setDueLocal] = useState("");
  const [descTab, setDescTab] = useState<"edit" | "preview">("edit");

  const syncFromTask = useCallback((t: TaskWithAssignee | null) => {
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description ?? "");
    setPriority((t.priority as TaskPriority) ?? "medium");
    setColumnId(t.column_id);
    setAssigneeId(t.assignee_id ?? "");
    setDueLocal(isoToLocalDatetimeValue(t.due_date));
    setDescTab("edit");
  }, []);

  useEffect(() => {
    if (task) syncFromTask(task);
  }, [task, syncFromTask]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const userOptions = useMemo(
    () =>
      [...tenantUsers].sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email, "pt")
      ),
    [tenantUsers]
  );

  if (!open || !task) return null;

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("O título é obrigatório.");
      return;
    }

    const patch: UpdateTaskInput = {};
    if (trimmed !== task.title) patch.title = trimmed;

    const nextDesc = description.trim() ? description : null;
    if (nextDesc !== (task.description ?? null)) {
      patch.description = nextDesc;
    }

    if (priority !== (task.priority as TaskPriority)) {
      patch.priority = priority;
    }
    if (columnId !== task.column_id) {
      patch.column_id = columnId;
    }

    const nextAssignee = assigneeId === "" ? null : assigneeId;
    const prevAssignee = task.assignee_id ?? null;
    if (nextAssignee !== prevAssignee) {
      patch.assignee_id = nextAssignee;
    }

    const nextDue = localDatetimeToIsoOrNull(dueLocal);
    const prevDue = task.due_date
      ? new Date(task.due_date).toISOString()
      : null;
    if (nextDue !== prevDue) {
      patch.due_date = nextDue;
    }

    if (Object.keys(patch).length === 0) {
      toast.message("Sem alterações para guardar.");
      return;
    }

    updateTask.mutate(
      { taskId: task.id, patch },
      {
        onSuccess: () => toast.success("Tarefa atualizada."),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Excluir esta tarefa? Esta ação não pode ser desfeita.")
    ) {
      return;
    }
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success("Tarefa excluída.");
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const busy = updateTask.isPending || deleteTask.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        aria-label="Fechar modal"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id="task-modal-title" className="text-lg font-semibold text-slate-900">
            Detalhe da tarefa
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 -mr-1"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 kanban-scroll">
          <div>
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="mt-1"
            />
          </div>

          <div>
            <div className="flex gap-2 mb-1">
              <Label>Descrição (Markdown)</Label>
              <div className="ml-auto flex rounded-md border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  className={cn(
                    "px-2 py-0.5 rounded-sm",
                    descTab === "edit" ? "bg-slate-100 font-medium" : "text-slate-500"
                  )}
                  onClick={() => setDescTab("edit")}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-2 py-0.5 rounded-sm",
                    descTab === "preview"
                      ? "bg-slate-100 font-medium"
                      : "text-slate-500"
                  )}
                  onClick={() => setDescTab("preview")}
                >
                  Pré-visualizar
                </button>
              </div>
            </div>
            {descTab === "edit" ? (
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
                rows={8}
                className={cn(
                  "mt-1 flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm",
                  "shadow-sm transition-colors placeholder:text-slate-400",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
                placeholder="Use **negrito**, listas, links…"
              />
            ) : (
              <div
                className={cn(
                  "mt-1 min-h-[12rem] rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm",
                  "text-slate-800 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2",
                  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
                  "[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_a]:text-brand-700 [&_a]:underline",
                  "[&_code]:rounded [&_code]:bg-slate-200/80 [&_code]:px-1 [&_code]:text-xs"
                )}
              >
                {description.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {description}
                  </ReactMarkdown>
                ) : (
                  <p className="text-slate-400 italic">Sem descrição.</p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task-priority">Prioridade</Label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={busy}
                className={cn(
                  "mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm",
                  "shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="task-column">Coluna</Label>
              <select
                id="task-column"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                disabled={busy}
                className={cn(
                  "mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm",
                  "shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task-due">Prazo</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                disabled={busy}
                className="mt-1"
              />
              <button
                type="button"
                className="mt-1 text-xs text-slate-500 underline hover:text-slate-800"
                onClick={() => setDueLocal("")}
                disabled={busy}
              >
                Limpar prazo
              </button>
            </div>
            <div>
              <Label htmlFor="task-assignee">Responsável</Label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={busy}
                className={cn(
                  "mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm",
                  "shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                <option value="">— Ninguém —</option>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name?.trim() || u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={busy}
          >
            Excluir
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
