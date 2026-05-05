"use client";

import { useMemo, useState } from "react";
import type { BoardColumn } from "@/lib/types/kanban";
import type { TaskWithAssignee } from "@/lib/types/kanban";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import {
  TaskModal,
  type CreateTaskIntent,
} from "@/components/kanban/task-modal";
import { useBoardTasks } from "@/hooks/use-board-tasks";
import { useTenantUsers } from "@/hooks/use-tenant-users";

type BoardKanbanProps = {
  boardId: string;
  columns: Pick<BoardColumn, "id" | "name" | "color" | "sort_order">[];
  initialTasks?: TaskWithAssignee[];
};

export function BoardKanban({ boardId, columns, initialTasks }: BoardKanbanProps) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createIntent, setCreateIntent] = useState<CreateTaskIntent | null>(
    null
  );

  const { data: taskList = [], isLoading, isError, error } = useBoardTasks(
    boardId,
    initialTasks
  );
  const { data: tenantUsers = [] } = useTenantUsers();

  const tasksByColumn = useMemo(() => {
    const m = new Map<string, TaskWithAssignee[]>();
    for (const t of taskList) {
      const arr = m.get(t.column_id) ?? [];
      arr.push(t);
      m.set(t.column_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return m;
  }, [taskList]);

  const selected = useMemo(
    () => (detailId ? taskList.find((t) => t.id === detailId) ?? null : null),
    [detailId, taskList]
  );

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );

  const modalOpen =
    createIntent !== null || (detailId !== null && selected !== null);

  const closeModal = () => {
    setDetailId(null);
    setCreateIntent(null);
  };

  return (
    <>
      {isLoading && (
        <p className="text-sm text-slate-500">A carregar tarefas…</p>
      )}
      {isError && (
        <p className="text-sm text-red-600">
          {error?.message ?? "Erro ao carregar tarefas."}
        </p>
      )}
      {!isLoading && !isError && (
        <div className="kanban-scroll flex-1 flex gap-4 overflow-x-auto pb-3">
          {sortedColumns.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este quadro ainda não tem colunas.
            </p>
          ) : (
            sortedColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn.get(col.id) ?? []}
                onOpenTask={(t) => {
                  setCreateIntent(null);
                  setDetailId(t.id);
                }}
                onBeginCreate={(columnId, initialTitle) => {
                  setDetailId(null);
                  setCreateIntent({ columnId, initialTitle });
                }}
              />
            ))
          )}
        </div>
      )}

      <TaskModal
        open={modalOpen}
        editingTask={selected}
        createIntent={createIntent}
        boardId={boardId}
        columns={sortedColumns.map((c) => ({ id: c.id, name: c.name }))}
        tenantUsers={tenantUsers}
        onClose={closeModal}
      />
    </>
  );
}
