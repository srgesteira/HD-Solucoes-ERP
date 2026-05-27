"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEpicsPipeline } from "@/hooks/use-epics-pipeline";
import type { EpicPipelineItem } from "@/modules/core/types/epic-pipeline";
import { cn } from "@/shared/utils/cn";
import { EpicDetailModal } from "@/components/boards/epic-detail-modal";
import { CreateEpicButton } from "@/components/boards/create-epic-button";

function EpicPipelineCard({
  item,
  onOpen,
}: {
  item: EpicPipelineItem;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 bg-white shadow-sm transition",
        "hover:border-brand-600 hover:shadow"
      )}
    >
      <button
        type="button"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        title="A posição nesta vista é calculada pelas sub-tarefas no projeto; não é possível arrastar o cartão aqui."
        onClick={onOpen}
        className={cn(
          "w-full text-left p-3 transition cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-t-md"
        )}
      >
        <p className="text-sm font-semibold text-slate-900 line-clamp-2">{item.title}</p>
        <p className="text-xs text-slate-500 mt-1 truncate">{item.board_name}</p>
        <p className="text-[11px] text-slate-400 mt-1">
          {item.subtask_count}{" "}
          {item.subtask_count === 1 ? "sub-tarefa" : "sub-tarefas"}
        </p>
      </button>
      <div className="px-3 pb-2.5 pt-0 border-t border-slate-100">
        <Link
          href={`/boards/${item.board_id}`}
          className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Abrir projeto completo
        </Link>
      </div>
    </div>
  );
}

export function BoardsPipelineKanban() {
  const [tab, setTab] = useState<"active" | "done">("active");
  const [openEpic, setOpenEpic] = useState<EpicPipelineItem | null>(null);

  const { data, isPending, error } = useEpicsPipeline(true);

  const handleCloseEpic = useCallback(() => {
    setOpenEpic(null);
  }, []);

  return (
    <div className="mb-8">
      {/* Modal fica sempre montado: estado do clique não se perde e abre sempre em top-layer do navegador */}
      <EpicDetailModal
        open={openEpic !== null}
        epic={openEpic}
        onClose={handleCloseEpic}
      />

      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar projetos…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 py-4">
          {error.message}
        </p>
      ) : !data ? (
        <p className="text-sm text-red-600 py-4">
          Não foi possível carregar o painel.
        </p>
      ) : (
        <>
          {data.migration_pending ? (
            <div
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
            >
              <strong className="font-semibold">Base de dados em falta:</strong> a tabela{" "}
              <code className="rounded bg-amber-100/80 px-1 text-xs">epics</code> ainda não
              foi criada neste projeto Supabase. Aplique o SQL da pasta{" "}
              <code className="rounded bg-amber-100/80 px-1 text-xs">
                supabase/migrations/
              </code>{" "}
              (ex.: <code className="rounded bg-amber-100/80 px-1 text-xs">db push</code>) e
              recarregue a página.
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Projetos (Kanban global)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {data.visibility === "tenant_admin"
                  ? "Administrador: vê todos os projetos do tenant."
                  : "Vê projetos que criou ou com sub-tarefas que criou, atribuídas a si ou @mencionadas."}{" "}
                <span className="text-brand-700">
                  Os cartões <strong>não se arrastam</strong> aqui: em <strong>Em Andamento</strong> quando
                  alguma sub-tarefa entra nessa coluna no projeto; em <strong>Finalizados</strong> quando
                  todas estão na última coluna.
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CreateEpicButton migrationPending={data.migration_pending === true} />
            </div>
          </div>

          <div className="flex gap-2 mb-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition",
                tab === "active"
                  ? "border-brand-700 text-brand-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              Em execução
            </button>
            <button
              type="button"
              onClick={() => setTab("done")}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition",
                tab === "done"
                  ? "border-brand-700 text-brand-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              Finalizados
              <span className="ml-1 text-xs text-slate-400">({data.finished.length})</span>
            </button>
          </div>

          {tab === "done" ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 max-h-[min(60vh,480px)] overflow-y-auto kanban-scroll">
              {data.finished.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhum projeto finalizado.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.finished.map((e) => (
                    <li key={e.id}>
                      <EpicPipelineCard item={e} onOpen={() => setOpenEpic(e)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="kanban-scroll flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 pointer-events-auto">
              {data.columns.map((col) => (
                <div
                  key={col.key}
                  className="w-[min(100%,280px)] sm:w-72 shrink-0 flex flex-col rounded-lg bg-slate-100/80 border border-slate-200/80 p-3 max-h-[min(70vh,520px)]"
                >
                  <div className="flex items-center gap-2 shrink-0 mb-2 pb-2 border-b border-slate-200/80">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: col.color }}
                      aria-hidden
                    />
                    <h4 className="font-medium text-slate-800 text-sm">{col.label}</h4>
                    <span className="text-xs text-slate-500">{col.epics.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto kanban-scroll pr-0.5">
                    {col.epics.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Nenhum projeto</p>
                    ) : (
                      col.epics.map((e) => (
                        <EpicPipelineCard
                          key={e.id}
                          item={e}
                          onOpen={() => setOpenEpic(e)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
