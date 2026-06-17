"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

type RoutingStep = {
  id: string;
  sequence: number;
  name: string;
  production_line_id: string | null;
  work_center_id: string | null;
  default_duration_minutes: number | null;
  notes: string | null;
};

type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

type WorkCenterOption = {
  id: string;
  code: string;
  name: string;
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700";

async function fetchRoutingSteps(productId: string): Promise<RoutingStep[]> {
  const res = await fetch(`/api/products/${productId}/routing-steps`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: RoutingStep[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar roteiro");
  return json.items ?? [];
}

async function fetchProductionLines(): Promise<ProductionLineOption[]> {
  const res = await fetch("/api/production/lines", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionLineOption[];
  };
  if (!res.ok) return [];
  return (json.data ?? []).filter((l) => l.is_active !== false);
}

async function fetchWorkCenters(): Promise<WorkCenterOption[]> {
  const res = await fetch("/api/work-centers", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: WorkCenterOption[];
  };
  if (!res.ok) return [];
  return json.data ?? [];
}

type ProductRoutingPanelProps = {
  productId: string;
  embedded?: boolean;
};

export function ProductRoutingPanel({
  productId,
  embedded = false,
}: ProductRoutingPanelProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [productionLineId, setProductionLineId] = useState("");
  const [workCenterId, setWorkCenterId] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const stepsQuery = useQuery({
    queryKey: ["product-routing-steps", productId],
    queryFn: () => fetchRoutingSteps(productId),
    enabled: Boolean(productId),
  });

  const linesQuery = useQuery({
    queryKey: ["production-lines-routing"],
    queryFn: fetchProductionLines,
  });

  const wcQuery = useQuery({
    queryKey: ["work-centers-routing"],
    queryFn: fetchWorkCenters,
  });

  const steps = useMemo(
    () => [...(stepsQuery.data ?? [])].sort((a, b) => a.sequence - b.sequence),
    [stepsQuery.data]
  );

  const lineMap = useMemo(
    () => new Map((linesQuery.data ?? []).map((l) => [l.id, l])),
    [linesQuery.data]
  );

  const wcMap = useMemo(
    () => new Map((wcQuery.data ?? []).map((w) => [w.id, w])),
    [wcQuery.data]
  );

  const nextSequence =
    steps.length > 0 ? Math.max(...steps.map((s) => s.sequence)) + 1 : 1;

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nome da operação é obrigatório.");

      const durationNum =
        duration.trim() === "" ? null : Number(duration.replace(",", "."));
      if (durationNum != null && (!Number.isFinite(durationNum) || durationNum < 0)) {
        throw new Error("Duração inválida.");
      }

      const res = await fetch(`/api/products/${productId}/routing-steps`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence: nextSequence,
          name: trimmed,
          production_line_id: productionLineId || null,
          work_center_id: workCenterId || null,
          default_duration_minutes: durationNum,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao adicionar operação");
    },
    onSuccess: async () => {
      toast.success("Operação adicionada ao roteiro.");
      setName("");
      setProductionLineId("");
      setWorkCenterId("");
      setDuration("");
      setNotes("");
      await qc.invalidateQueries({
        queryKey: ["product-routing-steps", productId],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res = await fetch(
        `/api/products/${productId}/routing-steps?stepId=${encodeURIComponent(stepId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao remover operação");
    },
    onSuccess: async () => {
      toast.success("Operação removida.");
      await qc.invalidateQueries({
        queryKey: ["product-routing-steps", productId],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const body = (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Defina as operações de fabricação deste produto. Ao criar uma ordem de
        produção, o sistema copia este roteiro para cada item. Sem roteiro
        cadastrado, usa uma operação única &quot;Produção&quot;.
      </p>

      {stepsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          A carregar roteiro…
        </div>
      ) : stepsQuery.isError ? (
        <p className="text-sm text-red-600">
          {stepsQuery.error instanceof Error
            ? stepsQuery.error.message
            : "Erro ao carregar roteiro."}
        </p>
      ) : steps.length === 0 ? (
        <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-4 text-center">
          Nenhuma operação definida — será usada operação única na OP.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="p-3 w-12">#</th>
                <th className="p-3">Operação</th>
                <th className="p-3">Linha</th>
                <th className="p-3">Centro</th>
                <th className="p-3 w-24">Min</th>
                <th className="p-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {steps.map((step) => {
                const line = step.production_line_id
                  ? lineMap.get(step.production_line_id)
                  : null;
                const wc = step.work_center_id
                  ? wcMap.get(step.work_center_id)
                  : null;
                return (
                  <tr key={step.id} className="hover:bg-slate-50/80">
                    <td className="p-3 font-mono text-slate-600">
                      {step.sequence}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{step.name}</div>
                      {step.notes ? (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {step.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-slate-700">
                      {line ? `${line.code} — ${line.name}` : "—"}
                    </td>
                    <td className="p-3 text-slate-700">
                      {wc ? `${wc.code} — ${wc.name}` : "—"}
                    </td>
                    <td className="p-3 tabular-nums text-slate-700">
                      {step.default_duration_minutes ?? "—"}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(step.id)}
                        aria-label={`Remover ${step.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
        <p className="text-sm font-medium text-slate-900">
          Adicionar operação #{nextSequence}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="routing_name">Nome</Label>
            <Input
              id="routing_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Corte, Montagem, Pintura"
            />
          </div>
          <div>
            <Label htmlFor="routing_line">Linha de produção</Label>
            <select
              id="routing_line"
              className={SELECT_CLASS}
              value={productionLineId}
              onChange={(e) => setProductionLineId(e.target.value)}
            >
              <option value="">— Padrão do produto —</option>
              {(linesQuery.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="routing_wc">Centro de trabalho</Label>
            <select
              id="routing_wc"
              className={SELECT_CLASS}
              value={workCenterId}
              onChange={(e) => setWorkCenterId(e.target.value)}
            >
              <option value="">— Nenhum —</option>
              {(wcQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="routing_duration">Duração (min)</Label>
            <Input
              id="routing_duration"
              type="number"
              min={0}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="routing_notes">Notas</Label>
            <Textarea
              id="routing_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instruções ou observações"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={addMutation.isPending || !name.trim()}
          onClick={() => addMutation.mutate()}
        >
          {addMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Adicionar operação
        </Button>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Roteiro de produção
          </CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  return body;
}
