"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useBoards } from "@/hooks/use-boards";
import { EPICS_PIPELINE_KEY } from "@/hooks/use-epics-pipeline";

export function CreateEpicButton({
  migrationPending = false,
}: {
  migrationPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [boardId, setBoardId] = useState("");
  const qc = useQueryClient();
  const { data: boards } = useBoards();

  const createEpic = useMutation({
    mutationFn: async (payload: { board_id: string; title: string }) => {
      const res = await fetch("/api/epics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as {
        epic?: { id: string };
        error?: string;
      };
      if (!res.ok || !j.epic) throw new Error(j.error ?? "Erro ao criar projeto");
      return j.epic;
    },
    onSuccess: () => {
      toast.success("Projeto criado.");
      void qc.invalidateQueries({ queryKey: EPICS_PIPELINE_KEY });
      void qc.invalidateQueries({ queryKey: ["boards"] });
      setOpen(false);
      setTitle("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={migrationPending}
        title={
          migrationPending
            ? "Aplique primeiro a migration que cria a tabela epics no Supabase."
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Novo projeto
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm w-full sm:w-auto sm:min-w-[280px]">
      <Label htmlFor="epic-board">Projeto</Label>
      <select
        id="epic-board"
        value={boardId}
        onChange={(e) => setBoardId(e.target.value)}
        className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
      >
        <option value="">— Escolha o projeto —</option>
        {(boards ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Label htmlFor="epic-title">Nome do projeto (ex.: UTA)</Label>
      <Input
        id="epic-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="UTA"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!boardId || !title.trim() || createEpic.isPending}
          onClick={() => {
            createEpic.mutate({ board_id: boardId, title: title.trim() });
          }}
        >
          Criar
        </Button>
      </div>
    </div>
  );
}
