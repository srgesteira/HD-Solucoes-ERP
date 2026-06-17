"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Wind } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  HVAC_CLEANROOM_CLASSES,
  HVAC_FILTER_CLASSES,
  HVAC_INTEGRITY_TEST_METHODS,
  type HvacProductSpecs,
} from "@/modules/hvac/lib/hvac-domain";

type Props = {
  productId: string;
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700";

async function fetchHvacSpecs(productId: string): Promise<{
  specs: HvacProductSpecs;
  applicable: boolean;
  hvac_specs_enabled: boolean;
}> {
  const res = await fetch(`/api/products/${productId}/hvac-specs`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    specs?: HvacProductSpecs;
    applicable?: boolean;
    hvac_specs_enabled?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar specs HVAC");
  return {
    specs: json.specs ?? {
      hvac_filter_class: null,
      hvac_airflow_m3h: null,
      hvac_pressure_drop_pa: null,
      hvac_cleanroom_class: null,
      hvac_requires_integrity_test: false,
      hvac_integrity_test_method: null,
    },
    applicable: json.applicable ?? false,
    hvac_specs_enabled: json.hvac_specs_enabled === true,
  };
}

export function ProductHvacSpecsPanel({ productId }: Props) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["product-hvac-specs", productId],
    queryFn: () => fetchHvacSpecs(productId),
  });

  const [form, setForm] = useState<HvacProductSpecs>({
    hvac_filter_class: null,
    hvac_airflow_m3h: null,
    hvac_pressure_drop_pa: null,
    hvac_cleanroom_class: null,
    hvac_requires_integrity_test: false,
    hvac_integrity_test_method: null,
  });

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (query.data?.specs) setForm(query.data.specs);
    if (query.data) setEnabled(query.data.hvac_specs_enabled);
  }, [query.data?.specs, query.data?.hvac_specs_enabled, query.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      specs: HvacProductSpecs;
      hvac_specs_enabled?: boolean;
    }) => {
      const res = await fetch(`/api/products/${productId}/hvac-specs`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload.specs,
          hvac_specs_enabled: payload.hvac_specs_enabled,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao gravar");
    },
    onSuccess: () => {
      toast.success("Especificações HVAC gravadas.");
      void qc.invalidateQueries({ queryKey: ["product-hvac-specs", productId] });
      void qc.invalidateQueries({ queryKey: ["product", productId] });
      void qc.invalidateQueries({ queryKey: ["data-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar ficha HVAC…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-red-600 py-4">
        {(query.error as Error).message}
      </p>
    );
  }

  if (!query.data?.applicable) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-500">
          Especificações HVAC aplicam-se a produtos acabados (prefixo AC ou
          HD1–HD3).
        </CardContent>
      </Card>
    );
  }

  if (!query.data?.applicable) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-500">
          Especificações HVAC aplicam-se a produtos acabados (prefixo AC ou
          HD1–HD3).
        </CardContent>
      </Card>
    );
  }

  const toggleEnabled = async (next: boolean) => {
    setEnabled(next);
    try {
      await saveMutation.mutateAsync({
        specs: form,
        hvac_specs_enabled: next,
      });
    } catch {
      setEnabled(!next);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Wind className="h-5 w-5 text-brand-700" />
            Ficha técnica HVAC
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Opcional — active só para produtos filtro/HEPA. Sem activar, CQ e
            saúde do dado não exigem esta ficha.
          </p>
        </div>
        {enabled ? (
          <Button
            type="button"
            size="sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ specs: form })}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Gravar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
            checked={enabled}
            disabled={saveMutation.isPending}
            onChange={(e) => void toggleEnabled(e.target.checked)}
          />
          <span className="text-sm text-slate-800">
            <span className="font-medium">Usar ficha técnica HVAC neste produto</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Desligado = produto acabado genérico, sem exigências HEPA/CQ vertical.
            </span>
          </span>
        </label>

        {!enabled ? (
          <p className="text-sm text-slate-500 pb-2">
            Active a opção acima para preencher classe de filtro, vazão e teste de
            integridade.
          </p>
        ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hvac_filter_class">Classe do filtro</Label>
          <select
            id="hvac_filter_class"
            className={SELECT_CLASS}
            value={form.hvac_filter_class ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                hvac_filter_class: e.target.value || null,
              }))
            }
          >
            <option value="">— Selecionar —</option>
            {HVAC_FILTER_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hvac_cleanroom_class">Classe de sala limpa</Label>
          <select
            id="hvac_cleanroom_class"
            className={SELECT_CLASS}
            value={form.hvac_cleanroom_class ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                hvac_cleanroom_class: e.target.value || null,
              }))
            }
          >
            <option value="">— Selecionar —</option>
            {HVAC_CLEANROOM_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hvac_airflow_m3h">Vazão nominal (m³/h)</Label>
          <Input
            id="hvac_airflow_m3h"
            type="number"
            min={0}
            step="0.01"
            value={form.hvac_airflow_m3h ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                hvac_airflow_m3h:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hvac_pressure_drop_pa">
            Queda de pressão nominal (Pa)
          </Label>
          <Input
            id="hvac_pressure_drop_pa"
            type="number"
            min={0}
            step="0.01"
            value={form.hvac_pressure_drop_pa ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                hvac_pressure_drop_pa:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
          <input
            id="hvac_requires_integrity_test"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={form.hvac_requires_integrity_test}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                hvac_requires_integrity_test: e.target.checked,
                hvac_integrity_test_method: e.target.checked
                  ? f.hvac_integrity_test_method
                  : null,
              }))
            }
          />
          <Label htmlFor="hvac_requires_integrity_test" className="font-normal">
            Exige teste de integridade antes de expedir (HEPA / área classificada)
          </Label>
        </div>

        {form.hvac_requires_integrity_test ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hvac_integrity_test_method">
              Método de teste de integridade
            </Label>
            <select
              id="hvac_integrity_test_method"
              className={SELECT_CLASS}
              value={form.hvac_integrity_test_method ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  hvac_integrity_test_method: e.target.value || null,
                }))
              }
            >
              <option value="">— Selecionar —</option>
              {HVAC_INTEGRITY_TEST_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
        )}
      </CardContent>
    </Card>
  );
}
