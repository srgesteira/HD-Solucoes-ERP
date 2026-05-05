"use client";

import Link from "next/link";
import { Plus, KanbanSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BoardCard } from "@/components/boards/board-card";
import { useBoards } from "@/hooks/use-boards";

export default function BoardsPage() {
  const { data: boards, isLoading, error, refetch, isFetching } = useBoards();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Quadros</h2>
          <p className="text-sm text-slate-500 mt-1">
            Organize tarefas em quadros Kanban customizáveis.
          </p>
        </div>
        <Link
          href="/boards/new"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium h-9 px-4 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Novo quadro</span>
        </Link>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{error.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetch()}
            >
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando quadros…</span>
        </div>
      ) : !boards || boards.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <KanbanSquare className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Nenhum quadro ainda</CardTitle>
                <CardDescription>
                  Crie seu primeiro quadro para começar a organizar tarefas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Link
              href="/boards/new"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium h-9 px-4"
            >
              <Plus className="h-4 w-4" />
              <span>Criar quadro</span>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
          {isFetching ? (
            <p className="mt-4 text-xs text-slate-400 text-center">
              Atualizando…
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
