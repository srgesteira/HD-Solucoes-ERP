"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/utils/cn";

type Props = {
  productId: string;
};

type CompositionSettings = {
  composition_enabled: boolean;
  can_toggle: boolean;
  is_resale: boolean;
  prefix_code: string | null;
};

async function fetchCompositionSettings(
  productId: string
): Promise<CompositionSettings> {
  const res = await fetch(`/api/products/${productId}/composition-settings`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as CompositionSettings & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar composição");
  }
  return {
    composition_enabled: json.composition_enabled === true,
    can_toggle: json.can_toggle === true,
    is_resale: json.is_resale === true,
    prefix_code: json.prefix_code ?? null,
  };
}

export function ProductCompositionSettingsPanel({ productId }: Props) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["product-composition-settings", productId],
    queryFn: () => fetchCompositionSettings(productId),
  });

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (query.data) setEnabled(query.data.composition_enabled);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: async (composition_enabled: boolean) => {
      const res = await fetch(
        `/api/products/${productId}/composition-settings`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ composition_enabled }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao gravar");
    },
    onSuccess: () => {
      toast.success("Preferência de composição actualizada.");
      void qc.invalidateQueries({
        queryKey: ["product-composition-settings", productId],
      });
      void qc.invalidateQueries({ queryKey: ["product", productId] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-red-600 py-2">
        {(query.error as Error).message}
      </p>
    );
  }

  if (query.data?.is_resale) {
    return (
      <Card className="border-sky-200 bg-sky-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-sky-950">
            <Layers className="h-4 w-4" />
            Revenda — sem composição
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-sky-900/90 space-y-2">
          <p>
            Produtos HD3 (revendidos) não têm receita de fabricação. Defina o
            custo manualmente ou deixe actualizar no recebimento de compra.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!query.data?.can_toggle) {
    return null;
  }

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await saveMutation.mutateAsync(next);
    } catch {
      setEnabled(!next);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-700" />
            Usar composição (BOM)
          </CardTitle>
          <p className="text-xs text-slate-600 mt-1 max-w-xl">
            Desactivado: custo manual (actualizado na compra). Activado: receita
            com materiais e mão-de-obra — não pode ser revenda.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saveMutation.isPending}
          onClick={() => void toggle(!enabled)}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            enabled ? "bg-emerald-600" : "bg-slate-300",
            saveMutation.isPending && "opacity-60"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition",
              enabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </CardHeader>
      {!enabled ? (
        <CardContent className="pt-0">
          <p className="text-xs text-slate-600 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            Composição desactivada — preencha o custo na aba{" "}
            <strong>Informações básicas</strong> e libere para vendas quando
            estiver pronto.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
