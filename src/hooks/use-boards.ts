"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Board, BoardSummary } from "@/modules/core/types/kanban";
import type { CreateBoardInput } from "@/modules/boards/lib/validators/board";

export const BOARDS_QUERY_KEY = ["boards"] as const;

async function fetchBoards(): Promise<BoardSummary[]> {
  const res = await fetch("/api/boards", {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Erro ${res.status} ao listar projetos`);
  }
  const json = (await res.json()) as { boards: BoardSummary[] };
  return json.boards;
}

export function useBoards(): UseQueryResult<BoardSummary[], Error> {
  return useQuery({
    queryKey: BOARDS_QUERY_KEY,
    queryFn: fetchBoards,
  });
}

async function createBoard(input: CreateBoardInput): Promise<Board> {
  const res = await fetch("/api/boards", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as {
    board?: Board;
    error?: string;
  };
  if (!res.ok || !json.board) {
    throw new Error(json.error ?? `Erro ${res.status} ao criar projeto`);
  }
  return json.board;
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBoard,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });
}
