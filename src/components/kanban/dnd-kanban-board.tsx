"use client";

import { useMemo, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  type DragEndEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { BoardColumn } from "@/lib/types/kanban";
import type { TaskWithAssignee } from "@/lib/types/kanban";
import { TaskCard } from "@/components/kanban/task-card";
import { useUpdateTask } from "@/hooks/use-board-tasks";
import { useMe } from "@/hooks/use-me";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function findColumnForTask(
  taskId: string,
  byCol: Map<string, TaskWithAssignee[]>
): string | undefined {
  for (const [colId, list] of byCol) {
    if (list.some((t) => t.id === taskId)) return colId;
  }
  return undefined;
}

function SortableRow({
  task,
  canDrag,
  onOpen,
}: {
  task: TaskWithAssignee;
  canDrag: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-1.5 rounded-md",
        isDragging && "opacity-70"
      )}
    >
      {canDrag ? (
        <button
          type="button"
          className="mt-2 shrink-0 text-slate-400 hover:text-slate-600 touch-none cursor-grab active:cursor-grabbing"
          aria-label="Arrastar tarefa"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="mt-2 w-4 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <TaskCard task={task} onClick={onOpen} />
      </div>
    </div>
  );
}

function ColumnBody({
  columnId,
  children,
}: {
  columnId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${columnId}`,
    data: { type: "column", columnId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 flex-1 min-h-[80px] overflow-y-auto kanban-scroll pr-0.5 rounded-md transition-colors",
        isOver && "bg-teal-50/50 outline outline-1 outline-teal-200/80"
      )}
    >
      {children}
    </div>
  );
}

type DndKanbanBoardProps = {
  boardId: string;
  columns: Pick<BoardColumn, "id" | "name" | "color" | "sort_order">[];
  tasks: TaskWithAssignee[];
  onOpenTask: (task: TaskWithAssignee) => void;
  onBeginCreate: (columnId: string, initialTitle: string) => void;
};

export function DndKanbanBoard({
  boardId,
  columns,
  tasks,
  onOpenTask,
  onBeginCreate,
}: DndKanbanBoardProps) {
  const updateTask = useUpdateTask(boardId);
  const { data: me } = useMe();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor)
  );

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );

  const tasksByColumn = useMemo(() => {
    const m = new Map<string, TaskWithAssignee[]>();
    for (const t of tasks) {
      const arr = m.get(t.column_id) ?? [];
      arr.push(t);
      m.set(t.column_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return m;
  }, [tasks]);

  const canDrag = (t: TaskWithAssignee) =>
    !!me && (me.role === "admin" || t.created_by === me.id);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !me) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceCol = findColumnForTask(activeId, tasksByColumn);
    if (!sourceCol) return;

    let destCol = findColumnForTask(overId, tasksByColumn);
    let insertIndex = 0;

    if (overId.startsWith("drop-")) {
      destCol = overId.slice("drop-".length);
    }

    if (!destCol) return;

    const destList = (tasksByColumn.get(destCol) ?? []).filter(
      (t) => t.id !== activeId
    );

    if (overId.startsWith("drop-")) {
      insertIndex = destList.length;
    } else {
      const overIdx = destList.findIndex((t) => t.id === overId);
      if (overIdx >= 0) {
        insertIndex = overIdx;
      } else {
        insertIndex = destList.length;
      }
    }

    insertIndex = Math.max(0, Math.min(insertIndex, destList.length));

    try {
      await updateTask.mutateAsync({
        taskId: activeId,
        patch: {
          column_id: destCol,
          insert_index: insertIndex,
        },
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível mover a tarefa."
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-scroll flex-1 flex gap-4 overflow-x-auto pb-3">
        {sortedColumns.length === 0 ? (
          <p className="text-sm text-slate-500">
            Este projeto ainda não tem colunas.
          </p>
        ) : (
          sortedColumns.map((col) => {
            const colTasks = tasksByColumn.get(col.id) ?? [];
            const ids = colTasks.map((t) => t.id);

            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col gap-2 rounded-lg bg-slate-100/70 p-3 max-h-[calc(100vh-12rem)]"
              >
                <div className="flex items-center justify-between gap-2 px-1 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: col.color ?? "#64748b" }}
                    />
                    <h3 className="font-medium text-slate-800 text-sm truncate">
                      {col.name}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                <SortableContext
                  id={col.id}
                  items={ids}
                  strategy={verticalListSortingStrategy}
                >
                  <ColumnBody columnId={col.id}>
                    {colTasks.length === 0 ? (
                      <p className="text-xs text-slate-400 italic px-1 py-2">
                        Sem tarefas
                      </p>
                    ) : (
                      colTasks.map((task) => (
                        <SortableRow
                          key={task.id}
                          task={task}
                          canDrag={canDrag(task)}
                          onOpen={() => onOpenTask(task)}
                        />
                      ))
                    )}
                  </ColumnBody>
                </SortableContext>

                <form
                  className="shrink-0 pt-1 border-t border-slate-200/80 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const title = String(fd.get("title") ?? "").trim();
                    onBeginCreate(col.id, title);
                    form.reset();
                  }}
                >
                  <label className="sr-only" htmlFor={`quick-title-${col.id}`}>
                    Nova tarefa em {col.name}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id={`quick-title-${col.id}`}
                      name="title"
                      placeholder="Título da tarefa…"
                      autoComplete="off"
                      className="text-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      aria-label={`Abrir nova tarefa em ${col.name}`}
                      title="Abrir formulário com descrição e responsável"
                    >
                      +
                    </Button>
                  </div>
                </form>
              </div>
            );
          })
        )}
      </div>
    </DndContext>
  );
}
