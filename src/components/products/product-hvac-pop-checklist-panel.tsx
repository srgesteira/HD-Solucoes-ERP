"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ChecklistItem = {
  id?: string;
  sequence: number;
  label: string;
  detail: string | null;
  is_required: boolean;
};

type Props = {
  productId: string;
};

async function fetchChecklist(productId: string): Promise<{
  items: ChecklistItem[];
  has_pop_document: boolean;
}> {
  const res = await fetch(`/api/products/${productId}/hvac-checklist`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: ChecklistItem[];
    has_pop_document?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar checklist");
  return {
    items: json.items ?? [],
    has_pop_document: json.has_pop_document ?? false,
  };
}

export function ProductHvacPopChecklistPanel({ productId }: Props) {
  const qc = useQueryClient();
  const queryKey = ["product-hvac-checklist", productId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => fetchChecklist(productId),
  });

  const [items, setItems] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    if (query.data?.items) {
      setItems(
        query.data.items.map((item) => ({
          ...item,
          detail: item.detail ?? "",
        }))
      );
    }
  }, [query.data?.items]);

  const saveMutation = useMutation({
    mutationFn: async (payload: ChecklistItem[]) => {
      const res = await fetch(`/api/products/${productId}/hvac-checklist`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payload.map((item, idx) => ({
            sequence: idx + 1,
            label: item.label.trim(),
            detail: item.detail?.trim() || null,
            is_required: item.is_required,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao gravar checklist");
    },
    onSuccess: async () => {
      toast.success("Checklist POP HEPA gravado.");
      await qc.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao gravar."),
  });

  const seedMutation = useMutation({
    mutationFn: async (replace: boolean) => {
      const res = await fetch(
        `/api/products/${productId}/hvac-checklist/seed`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replace }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao aplicar template");
    },
    onSuccess: async () => {
      toast.success("Template HEPA aplicado.");
      await qc.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro."),
  });

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        sequence: prev.length + 1,
        label: "",
        detail: "",
        is_required: true,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    patch: Partial<Pick<ChecklistItem, "label" | "detail" | "is_required">>
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const hasPop = query.data?.has_pop_document === true;
  const pending = saveMutation.isPending || seedMutation.isPending;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-brand-800" />
          Checklist POP HEPA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Itens verificados pelo CQ em cada linha de OP. Anexe o ficheiro POP na
          aba{" "}
          <Link href={`/products/${productId}/edit?tab=documents`} className="text-brand-800 underline">
            Documentos
          </Link>{" "}
          (tipo POP).
        </p>

        {!hasPop ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Nenhum POP activo anexado — engenharia deve enviar o procedimento na aba Documentos.
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            POP activo encontrado na biblioteca de documentos.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                items.length > 0 &&
                !window.confirm(
                  "Substituir o checklist actual pelo template HEPA padrão?"
                )
              ) {
                return;
              }
              seedMutation.mutate(items.length > 0);
            }}
          >
            {seedMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Aplicar template HEPA
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4" />
            Adicionar item
          </Button>
        </div>

        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar checklist…
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum item configurado. Aplique o template HEPA ou adicione manualmente.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <li
                key={`${item.id ?? "new"}-${index}`}
                className="rounded-lg border border-slate-200 p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-slate-500 pt-2 w-6">
                    {index + 1}.
                  </span>
                  <div className="flex-1 space-y-2">
                    <Label className="sr-only">Item {index + 1}</Label>
                    <Input
                      value={item.label}
                      onChange={(e) =>
                        updateItem(index, { label: e.target.value })
                      }
                      placeholder="Descrição do ponto de verificação"
                    />
                    <Input
                      value={item.detail ?? ""}
                      onChange={(e) =>
                        updateItem(index, { detail: e.target.value })
                      }
                      placeholder="Detalhe opcional"
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={item.is_required}
                        onChange={(e) =>
                          updateItem(index, { is_required: e.target.checked })
                        }
                      />
                      Obrigatório para expedição
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-200"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 ? (
          <Button
            type="button"
            disabled={pending || items.some((i) => !i.label.trim())}
            onClick={() => saveMutation.mutate(items)}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Gravar checklist
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
