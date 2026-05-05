"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { TaskWithAssignee } from "@/lib/types/kanban";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validators/task";
import { TASKS_PIPELINE_KEY } from "@/hooks/use-tasks-pipeline";

export const boardTasksKey = (boardId: string) => ["board-tasks", boardId] as const;

async function fetchBoardTasks(boardId: string): Promise<TaskWithAssignee[]> {
  const res = await fetch(
    `/api/tasks?board_id=${encodeURIComponent(boardId)}`,
    { credentials: "include", cache: "no-store" }
  );
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao carregar tarefas");
  }
  const data = (await res.json()) as { tasks: TaskWithAssignee[] };
  return data.tasks;
}

export function useBoardTasks(
  boardId: string,
  initialData?: TaskWithAssignee[]
): UseQueryResult<TaskWithAssignee[], Error> {
  return useQuery({
    queryKey: boardTasksKey(boardId),
    queryFn: () => fetchBoardTasks(boardId),
    ...(initialData !== undefined
      ? { initialData, initialDataUpdatedAt: Date.now() }
      : {}),
  });
}

async function createTask(input: CreateTaskInput): Promise<TaskWithAssignee> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = (await res.json().catch(() => ({}))) as {
    task?: TaskWithAssignee;
    error?: string;
  };
  if (!res.ok || !j.task) {
    throw new Error(j.error ?? "Erro ao criar tarefa");
  }
  return j.task;
}

async function updateTask(
  taskId: string,
  patch: UpdateTaskInput
): Promise<TaskWithAssignee> {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const j = (await res.json().catch(() => ({}))) as {
    task?: TaskWithAssignee;
    error?: string;
  };
  if (!res.ok || !j.task) {
    throw new Error(j.error ?? "Erro ao atualizar tarefa");
  }
  return j.task;
}

async function deleteTask(taskId: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao excluir tarefa");
  }
}

export function useCreateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardTasksKey(boardId) });
      void qc.invalidateQueries({ queryKey: ["boards"] });
      void qc.invalidateQueries({ queryKey: TASKS_PIPELINE_KEY });
    },
  });
}

export function useUpdateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      patch,
    }: {
      taskId: string;
      patch: UpdateTaskInput;
    }) => updateTask(taskId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardTasksKey(boardId) });
      void qc.invalidateQueries({ queryKey: ["boards"] });
      void qc.invalidateQueries({ queryKey: TASKS_PIPELINE_KEY });
    },
  });
}

export function useDeleteTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardTasksKey(boardId) });
      void qc.invalidateQueries({ queryKey: ["boards"] });
      void qc.invalidateQueries({ queryKey: TASKS_PIPELINE_KEY });
    },
  });
}
