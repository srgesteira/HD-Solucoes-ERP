"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit, Factory, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

export const workCentersQueryKey = ["work-centers"] as const;

interface WorkCenter {
  id: string;
  code: string;
  name: string;
  hourly_cost: number;
  efficiency: number;
  description: string | null;
  is_active: boolean;
}

async function fetchWorkCenters(): Promise<WorkCenter[]> {
  const res = await fetch("/api/work-centers", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: WorkCenter[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar centros de trabalho");
  }
  if (!Array.isArray(json.data)) throw new Error("Resposta inválida da API");
  return json.data;
}

type CenterPayload = {
  code: string;
  name: string;
  hourly_cost: number;
  efficiency: number;
  description: string | null;
  is_active: boolean;
};

async function createWorkCenter(data: CenterPayload) {
  const res = await fetch("/api/work-centers", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao criar centro");
  return json;
}

async function updateWorkCenter(id: string, data: Partial<CenterPayload>) {
  const res = await fetch(`/api/work-centers/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar centro");
  return json;
}

async function deleteWorkCenter(id: string) {
  const res = await fetch(`/api/work-centers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao remover centro");
  return json;
}

export function WorkCentersAdmin() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<WorkCenter | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    hourly_cost: 0,
    efficiency: 1,
    description: "",
  });

  const {
    data: centers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: workCentersQueryKey,
    queryFn: fetchWorkCenters,
  });

  const createMutation = useMutation({
    mutationFn: createWorkCenter,
    onSuccess: async () => {
      toast.success("Centro de trabalho criado.");
      await queryClient.invalidateQueries({ queryKey: workCentersQueryKey });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CenterPayload>;
    }) => updateWorkCenter(id, data),
    onSuccess: async () => {
      toast.success("Centro de trabalho actualizado.");
      await queryClient.invalidateQueries({ queryKey: workCentersQueryKey });
      resetForm();
      setDialogOpen(false);
      setEditingCenter(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkCenter,
    onSuccess: async () => {
      toast.success("Centro desactivado.");
      await queryClient.invalidateQueries({ queryKey: workCentersQueryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function resetForm() {
    setFormData({
      code: "",
      name: "",
      hourly_cost: 0,
      efficiency: 1,
      description: "",
    });
    setEditingCenter(null);
  }

  function buildPayload(includeActive: boolean, activeValue: boolean): CenterPayload {
    return {
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      hourly_cost: Number(formData.hourly_cost) || 0,
      efficiency:
        typeof formData.efficiency === "number" &&
        Number.isFinite(formData.efficiency)
          ? formData.efficiency
          : 1,
      description: formData.description.trim() ? formData.description : null,
      is_active: includeActive ? activeValue : true,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const busy = createMutation.isPending || updateMutation.isPending;
    if (busy) return;

    if (editingCenter) {
      updateMutation.mutate({
        id: editingCenter.id,
        data: {
          ...buildPayload(true, editingCenter.is_active),
        },
      });
    } else {
      createMutation.mutate(buildPayload(true, true));
    }
  }

  function handleEdit(center: WorkCenter) {
    setEditingCenter(center);
    setFormData({
      code: center.code,
      name: center.name,
      hourly_cost: Number(center.hourly_cost ?? 0),
      efficiency: Number(center.efficiency ?? 1),
      description: center.description ?? "",
    });
    setDialogOpen(true);
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value ?? 0));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
        <div className="flex items-center gap-2 text-slate-700">
          <Factory className="h-5 w-5 shrink-0" aria-hidden />
          <span className="text-sm font-medium">Máquinas, linhas e equipas para custo hora na BOM.</span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Novo centro
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-red-800">
            {(error as Error).message ?? "Erro ao carregar."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Lista de centros
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10 text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              <span className="text-sm pt-1">A carregar…</span>
            </div>
          ) : centers?.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">
              Nenhum centro de trabalho cadastrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {centers?.map((center) => (
                <li
                  key={center.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-slate-200 rounded-lg bg-white"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded-md">
                        {center.code}
                      </span>
                      <span className="font-medium text-slate-900">{center.name}</span>
                      {!center.is_active ? (
                        <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          Inactivo
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      <span>Custo/h: {formatCurrency(center.hourly_cost)}</span>
                      <span className="mx-2">·</span>
                      <span>
                        Eficiência: {(Number(center.efficiency) * 100).toFixed(0)}
                        %
                      </span>
                    </div>
                    {center.description ? (
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                        {center.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(center)}
                      aria-label={`Editar ${center.name}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "text-red-600 border-red-200 hover:bg-red-50",
                        center.is_active ? "" : "opacity-60"
                      )}
                      disabled={
                        deleteMutation.isPending || !center.is_active
                      }
                      title={
                        !center.is_active
                          ? "Já está inactivo."
                          : "Desactivar centro"
                      }
                      onClick={() => {
                        if (!center.is_active) return;
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(
                            `Desactivar o centro «${center.name}» (${center.code})?`
                          )
                        ) {
                          return;
                        }
                        deleteMutation.mutate(center.id);
                      }}
                      aria-label={`Remover ${center.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="presentation"
          onClick={() => {
            resetForm();
            setDialogOpen(false);
          }}
        >
          <div
            className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wc-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="wc-dialog-title"
              className="text-lg font-semibold text-slate-900 pr-8"
            >
              {editingCenter
                ? "Editar centro de trabalho"
                : "Novo centro de trabalho"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Usados no cálculo de mão-de-obra quando a BOM marca um componente
              como trabalho (+ custo por hora).
            </p>
            <button
              type="button"
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-800 text-xl leading-none"
              aria-label="Fechar"
              onClick={() => {
                resetForm();
                setDialogOpen(false);
              }}
            >
              ×
            </button>
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="wc-code">Código *</Label>
                <Input
                  id="wc-code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wc-name">Nome *</Label>
                <Input
                  id="wc-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wc-hourly">Custo por hora (R$)</Label>
                <Input
                  id="wc-hourly"
                  type="number"
                  step="0.01"
                  min={0}
                  value={Number.isFinite(formData.hourly_cost) ? formData.hourly_cost : 0}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      hourly_cost: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wc-eff">Eficiência (0 a 2)</Label>
                <Input
                  id="wc-eff"
                  type="number"
                  step="0.05"
                  min={0}
                  max={2}
                  value={
                    Number.isFinite(formData.efficiency)
                      ? formData.efficiency
                      : 1
                  }
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      efficiency: parseFloat(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-xs text-slate-500">
                  1,0 equivale a 100%. Valores abaixo de 1 aumentam tempo implícito
                  efectivo por hora; acima de 1 representam maior rendimento nominal.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wc-desc">Descrição</Label>
                <Textarea
                  id="wc-desc"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Ex.: Centro de pintura linha Nord"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setDialogOpen(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {createMutation.isPending ||
                  updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      A gravar…
                    </>
                  ) : editingCenter ? (
                    "Guardar"
                  ) : (
                    "Criar"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
