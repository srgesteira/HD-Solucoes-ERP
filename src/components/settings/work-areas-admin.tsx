"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import type { WorkArea } from "@/modules/core/types/kanban";
import { workAreasQueryKey } from "@/hooks/use-work-areas";

async function fetchAreas(includeArchived: boolean): Promise<WorkArea[]> {
  const q = includeArchived ? "?include_archived=1" : "";
  const res = await fetch(`/api/work-areas${q}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro");
  }
  const data = (await res.json()) as { areas: WorkArea[] };
  return data.areas ?? [];
}

export function WorkAreasAdmin() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: areas = [], isLoading } = useQuery({
    queryKey: [...workAreasQueryKey, showArchived],
    queryFn: () => fetchAreas(showArchived),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/work-areas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        area?: WorkArea;
        error?: string;
      };
      if (!res.ok || !j.area) throw new Error(j.error ?? "Erro ao criar");
      return j.area;
    },
    onSuccess: () => {
      toast.success("Área criada.");
      setCode("");
      setName("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: workAreasQueryKey });
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "work-areas" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: async (payload: { id: string; is_archived: boolean }) => {
      const res = await fetch(`/api/work-areas/${payload.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: payload.is_archived }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao atualizar");
    },
    onSuccess: () => {
      toast.success("Área atualizada.");
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "work-areas" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = useMemo(
    () => [...areas].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")),
    [areas]
  );

  const tableColumns = useMemo((): SortableTableColumn<WorkArea>[] => {
    return [
      {
        key: "code",
        label: "Código",
        type: "text",
        width: "w-[15%]",
        accessor: (row) => row.code,
        truncate: false,
        render: (row) => (
          <span className="font-mono text-xs">{row.code}</span>
        ),
      },
      {
        key: "name",
        label: "Nome",
        type: "text",
        width: "w-[40%]",
        accessor: (row) => row.name,
        truncate: false,
        render: (row) => (
          <>
            <span className="font-medium text-slate-900">{row.name}</span>
            {row.description ? (
              <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>
            ) : null}
          </>
        ),
      },
      {
        key: "sort_order",
        label: "Ordem",
        type: "number",
        width: "w-[12%]",
        accessor: (row) => row.sort_order,
        render: (row) => (
          <span className="text-slate-600">{row.sort_order}</span>
        ),
      },
      {
        key: "state",
        label: "Estado",
        type: "text",
        width: "w-[18%]",
        accessor: (row) => (row.is_archived ? "Arquivada" : "Activa"),
        truncate: false,
        render: (row) =>
          row.is_archived ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={patchMut.isPending}
              onClick={() =>
                void patchMut.mutate({ id: row.id, is_archived: false })
              }
            >
              Reativar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-amber-700"
              disabled={patchMut.isPending}
              onClick={() =>
                void patchMut.mutate({ id: row.id, is_archived: true })
              }
            >
              Arquivar
            </Button>
          ),
      },
    ];
  }, [patchMut.isPending]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 max-w-xl">
          As áreas aparecem na criação/edição de tarefas; depois você poderá cruzar com horas ou esforço
          por centro de custo.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Mostrar arquivadas
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : (
        <SortableTable
          columns={tableColumns}
          data={sorted}
          getRowKey={(row) => row.id}
          emptyMessage="Nenhuma área. A migration semeia áreas típicas; execute o SQL se a lista estiver vazia."
          className="shadow-sm"
        />
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="font-medium text-slate-900 text-sm">Nova área</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="wa-code">Código</Label>
            <Input
              id="wa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ex.: LOG"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label htmlFor="wa-name">Nome</Label>
            <Input
              id="wa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Descrição curta para relatórios"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="wa-desc">Descrição (opcional)</Label>
            <Input
              id="wa-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void createMut.mutate()}
          disabled={createMut.isPending || code.trim().length < 2 || name.trim().length < 1}
        >
          {createMut.isPending ? "A guardar…" : "Adicionar área"}
        </Button>
      </div>
    </div>
  );
}
