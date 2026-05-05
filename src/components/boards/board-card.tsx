import Link from "next/link";
import { CheckSquare, Columns3, Crown } from "lucide-react";
import type { BoardSummary } from "@/lib/types/kanban";
import { cn } from "@/lib/utils/cn";

type BoardCardProps = {
  board: BoardSummary;
};

export function BoardCard({ board }: BoardCardProps) {
  const isOwner = board.member_role === "owner";
  const initial = (board.name.trim().charAt(0) || "•").toUpperCase();

  return (
    <Link
      href={`/boards/${board.id}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4",
        "transition-all hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
      )}
      aria-label={`Abrir quadro ${board.name}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-white font-semibold text-lg"
          style={{ backgroundColor: board.color ?? "#0f766e" }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 truncate">{board.name}</h3>
          {board.description ? (
            <p className="text-sm text-slate-500 line-clamp-2 mt-0.5">
              {board.description}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic mt-0.5">Sem descrição</p>
          )}
        </div>
        {isOwner ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 text-xs px-2 py-0.5"
            title="Você é o dono deste quadro"
          >
            <Crown className="h-3 w-3" />
            Dono
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 mt-auto pt-2 border-t border-slate-100">
        <span className="inline-flex items-center gap-1">
          <Columns3 className="h-3.5 w-3.5" />
          {board.column_count} {board.column_count === 1 ? "coluna" : "colunas"}
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckSquare className="h-3.5 w-3.5" />
          {board.task_count} {board.task_count === 1 ? "tarefa" : "tarefas"}
        </span>
      </div>
    </Link>
  );
}
