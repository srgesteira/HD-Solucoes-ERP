"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import type { BoardColumn } from "@/modules/core/types/kanban";
import type { TaskWithAssignee, UserProfile } from "@/modules/core/types/kanban";
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/modules/core/types/kanban";
import { cn } from "@/shared/utils/cn";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { useCreateTask, useDeleteTask, useUpdateTask } from "@/hooks/use-board-tasks";
import { useWorkAreas } from "@/hooks/use-work-areas";
import type { CreateTaskInput, UpdateTaskInput } from "@/modules/boards/lib/validators/task";
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

export type CreateTaskIntent = {
  columnId: string;
  initialTitle: string;
};

type TaskModalProps = {
  open: boolean;
  /** Edição: tarefa existente. Criação: null. */
  editingTask: TaskWithAssignee | null;
  /** Criação: coluna e título vindos do atalho. */
  createIntent: CreateTaskIntent | null;
  boardId: string;
  columns: Pick<BoardColumn, "id" | "name">[];
  tenantUsers: UserProfile[];
  onClose: () => void;
};

export function TaskModal({
  open,
  editingTask,
  createIntent,
  boardId,
  columns,
  tenantUsers,
  onClose,
}: TaskModalProps) {
  const isCreate = createIntent !== null && editingTask === null;

  const createTask = useCreateTask(boardId);
  const updateTask = useUpdateTask(boardId);
  const deleteTask = useDeleteTask(boardId);
  const workAreasQuery = useWorkAreas();
  const workAreas = workAreasQuery.data ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [columnId, setColumnId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [areaId, setAreaId] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [descTab, setDescTab] = useState<"edit" | "preview">("edit");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncFromTask = useCallback((t: TaskWithAssignee) => {
    setTitle(t.title);
    setDescription(t.description ?? "");
    setPriority((t.priority as TaskPriority) ?? "medium");
    setColumnId(t.column_id);
    setAssigneeId(t.assignee_id ?? "");
    setAreaId(t.area_id ?? "");
    setDueLocal(isoToLocalDatetimeValue(t.due_date));
    setDescTab("edit");
  }, []);

  const syncCreate = useCallback((intent: CreateTaskIntent) => {
    setTitle(intent.initialTitle);
    setDescription("");
    setPriority("medium");
    setColumnId(intent.columnId);
    setAssigneeId("");
    setAreaId("");
    setDueLocal("");
    setDescTab("edit");
  }, []);

  useEffect(() => {
    if (!open) return;
    if (isCreate && createIntent) {
      syncCreate(createIntent);
    } else if (!isCreate && editingTask) {
      syncFromTask(editingTask);
    }
  }, [open, isCreate, createIntent, editingTask, syncCreate, syncFromTask]);

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

  const areaOptions = useMemo(
    () =>
      [...workAreas]
        .filter((a) => !a.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code, "pt")),
    [workAreas]
  );

  if (!open || (isCreate && !createIntent) || (!isCreate && !editingTask)) {
    return null;
  }

  const handleSaveCreate = () => {
    if (!createIntent) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("O título é obrigatório.");
      return;
    }

    const input: CreateTaskInput = {
      board_id: boardId,
      column_id: columnId,
      title: trimmed,
      description: description.trim() ? description : null,
      priority,
      due_date: localDatetimeToIsoOrNull(dueLocal),
      assignee_id: assigneeId === "" ? null : assigneeId,
      area_id: areaId === "" ? null : areaId,
    };

    createTask.mutate(input, {
      onSuccess: () => {
        toast.success("Tarefa criada.");
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleSaveEdit = () => {
    if (!editingTask) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("O título é obrigatório.");
      return;
    }

    const patch: UpdateTaskInput = {};
    if (trimmed !== editingTask.title) patch.title = trimmed;

    const nextDesc = description.trim() ? description : null;
    if (nextDesc !== (editingTask.description ?? null)) {
      patch.description = nextDesc;
    }

    if (priority !== (editingTask.priority as TaskPriority)) {
      patch.priority = priority;
    }
    if (columnId !== editingTask.column_id) {
      patch.column_id = columnId;
    }

    const nextAssignee = assigneeId === "" ? null : assigneeId;
    const prevAssignee = editingTask.assignee_id ?? null;
    if (nextAssignee !== prevAssignee) {
      patch.assignee_id = nextAssignee;
    }

    const nextArea = areaId === "" ? null : areaId;
    const prevArea = editingTask.area_id ?? null;
    if (nextArea !== prevArea) {
      patch.area_id = nextArea;
    }

    const nextDue = localDatetimeToIsoOrNull(dueLocal);
    const prevDue = editingTask.due_date
      ? new Date(editingTask.due_date).toISOString()
      : null;
    if (nextDue !== prevDue) {
      patch.due_date = nextDue;
    }

    if (Object.keys(patch).length === 0) {
      toast.message("Sem alterações para guardar.");
      return;
    }

    updateTask.mutate(
      { taskId: editingTask.id, patch },
      {
        onSuccess: () => toast.success("Tarefa atualizada."),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = () => {
    if (!editingTask) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Excluir esta tarefa? Esta ação não pode ser desfeita.")
    ) {
      return;
    }
    deleteTask.mutate(editingTask.id, {
      onSuccess: () => {
        toast.success("Tarefa excluída.");
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const busy =
    createTask.isPending ||
    updateTask.isPending ||
    deleteTask.isPending;

  const areaSelectDisabled =
    busy || workAreasQuery.isPending || !!workAreasQuery.isError;

  const heading = isCreate ? "Nova tarefa" : "Detalhe da tarefa";

  if (!mounted) {
    return null;
  }

  const modal = (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
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
            {heading}
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

          <div>
            <Label htmlFor="task-area">Área / centro de custo</Label>
            <select
              id="task-area"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              disabled={areaSelectDisabled}
              className={cn(
                "mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm",
                "shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              <option value="">— Nenhuma —</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            {workAreasQuery.isError ? (
              <p className="mt-1 text-xs text-red-600">
                Não foi possível carregar as áreas. Recarregue a página ou tente de novo em instantes.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Classifique esta tarefa por departamento ou centro de custo — administradores
                mantêm o catálogo em <strong className="font-medium">Áreas / centros de custo</strong>{" "}
                no menu lateral.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          {!isCreate ? (
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={busy}
            >
              Excluir
            </Button>
          ) : (
            <span className="text-xs text-slate-500 max-w-[14rem]">
              Com responsável, enviamos e-mail para o endereço de cadastro (Resend).
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={isCreate ? handleSaveCreate : handleSaveEdit}
              disabled={busy}
            >
              {isCreate ? "Criar tarefa" : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
