"use client";

import { useMemo } from "react";
import type { BoardColumn } from "@/lib/types/kanban";
import type { TaskWithAssignee } from "@/lib/types/kanban";
import { DndKanbanBoard } from "@/components/kanban/dnd-kanban-board";
import { useCreateTask } from "@/hooks/use-board-tasks";

type EpicInnerKanbanProps = {
  boardId: string;
  epicId: string;
  columns: Pick<BoardColumn, "id" | "name" | "color" | "sort_order">[];
  tasks: TaskWithAssignee[];
  onOpenTask: (t: TaskWithAssignee) => void;
};

export function EpicInnerKanban({
  boardId,
  epicId,
  columns,
  tasks,
  onOpenTask,
}: EpicInnerKanbanProps) {
  const createTask = useCreateTask(boardId, { epicId });

  const sortedCols = useMemo(
    () => [...columns].sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );

  return (
    <div className="-mx-1 px-1 max-h-[min(60vh,420px)]">
      <DndKanbanBoard
        boardId={boardId}
        columns={sortedCols}
        tasks={tasks}
        onOpenTask={onOpenTask}
        onBeginCreate={(columnId, initialTitle) => {
          if (!initialTitle.trim()) return;
          createTask.mutate(
            {
              board_id: boardId,
              column_id: columnId,
              title: initialTitle,
              description: null,
              priority: "medium",
              due_date: null,
            },
            {
              onSuccess: () => {},
            }
          );
        }}
      />
    </div>
  );
}
