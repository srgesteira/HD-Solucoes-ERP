"use client";

import Link from "next/link";
import { Plus, KanbanSquare } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import { ErrorState, LoadingState } from "@/shared/ui/page-helpers";
import { BoardsPipelineKanban } from "@/components/boards/boards-pipeline-kanban";
import { useBoards } from "@/hooks/use-boards";

export default function BoardsPage() {
  const { data: boards, isLoading, error, refetch, isFetching } = useBoards();

  return (
    <AppPage
      title="Tarefas"
      description="Projetos no Kanban global; abra um projeto para trabalhar nas tarefas."
      density="comfortable"
      actions={
        <Link href="/boards/new">
          <Button type="button" size="sm">
            <Plus className="h-4 w-4" />
            Novo projeto
          </Button>
        </Link>
      }
    >
      <BoardsPipelineKanban />

      {error ? (
        <ErrorState
          message={error.message}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              Tentar de novo
            </Button>
          }
        />
      ) : isLoading ? (
        <LoadingState label="A carregar projetos…" />
      ) : !boards || boards.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <KanbanSquare className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Nenhum projeto ainda</CardTitle>
                <CardDescription>
                  Crie o seu primeiro projeto para começar a organizar tarefas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Link href="/boards/new">
              <Button type="button">
                <Plus className="h-4 w-4" />
                Criar projeto
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : isFetching ? (
        <p className="mt-4 text-xs text-slate-400 text-center">Atualizando…</p>
      ) : null}
    </AppPage>
  );
}
