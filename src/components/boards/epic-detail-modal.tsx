"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import type { EpicPipelineItem } from "@/modules/core/types/epic-pipeline";
import { EpicInnerKanban } from "@/components/boards/epic-inner-kanban";
import { TaskModal } from "@/components/kanban/task-modal";
import { useEpicTasks } from "@/hooks/use-board-tasks";
import { useTenantUsers } from "@/hooks/use-tenant-users";
import type { BoardColumn } from "@/modules/core/types/kanban";

async function fetchBoardColumns(boardId: string): Promise<
  Pick<BoardColumn, "id" | "name" | "color" | "sort_order">[]
> {
  const res = await fetch(`/api/boards/${boardId}/columns`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Colunas");
  const data = (await res.json()) as { columns: BoardColumn[] };
  return data.columns ?? [];
}

type EpicDetailModalProps = {
  open: boolean;
  epic: EpicPipelineItem | null;
  onClose: () => void;
};

export function EpicDetailModal({ open, epic, onClose }: EpicDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const [detailId, setDetailId] = useState<string | null>(null);

  const boardId = epic?.board_id ?? "";
  const epicId = epic?.id ?? "";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) setDetailId(null);
  }, [open]);

  useEffect(() => {
    setDetailId(null);
  }, [epic?.id]);

  const { data: columns = [] } = useQuery({
    queryKey: ["board-columns", boardId],
    queryFn: () => fetchBoardColumns(boardId),
    enabled: !!boardId && !!epic && open,
  });

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );

  const { data: taskList = [] } = useEpicTasks(boardId, open ? epicId : null);

  const { data: tenantUsers = [] } = useTenantUsers();

  const selected = useMemo(
    () =>
      detailId ? taskList.find((t) => t.id === detailId) ?? null : null,
    [detailId, taskList]
  );

  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const shouldShow = !!(open && epic);

    if (shouldShow && !el.open) {
      el.showModal();
    } else if (!shouldShow && el.open) {
      el.close();
    }
  }, [open, epic?.id]);

  return (
    <>
      <dialog
        ref={dialogRef}
        className={cn(
          "m-auto max-h-[92vh] w-[calc(100vw-2rem)] max-w-[56rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl",
          "open:flex open:flex-col",
          "[&::backdrop]:bg-slate-900/55 [&::backdrop]:backdrop-blur-[1px]"
        )}
        onClose={() => onCloseRef.current()}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            dialogRef.current?.close();
          }
        }}
      >
        {open && epic ? (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{epic.board_name}</p>
                <h2 className="text-lg font-semibold text-slate-900 truncate">
                  {epic.title}
                </h2>
                {epic.description ? (
                  <p className="mt-1 text-sm text-slate-600">{epic.description}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => dialogRef.current?.close()}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="mb-3 text-sm text-slate-600">
                Mover sub-tarefas entre colunas atualiza o cartão do projeto na página
                Tarefas: assim que alguma entra em <strong>Em Andamento</strong>, o
                projeto segue; quando todas estiverem na última coluna, o projeto vai
                para <strong>Finalizados</strong>.
              </p>
              <EpicInnerKanban
                boardId={boardId}
                epicId={epicId}
                columns={sortedColumns}
                tasks={taskList}
                onOpenTask={(t) => setDetailId(t.id)}
              />
            </div>
          </>
        ) : null}
      </dialog>

      {open && epic ? (
        <TaskModal
          open={detailId !== null && selected !== null}
          editingTask={selected}
          createIntent={null}
          boardId={boardId}
          columns={sortedColumns.map((c) => ({ id: c.id, name: c.name }))}
          tenantUsers={tenantUsers}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </>
  );
}
