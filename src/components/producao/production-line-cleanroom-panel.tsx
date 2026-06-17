"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  HVAC_CLEANROOM_CLASSES,
  type HvacCleanroomClass,
} from "@/modules/hvac/lib/hvac-domain";
import type { ProductionLineBrief } from "@/modules/producao/lib/production/production-lines-api";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";

type Props = {
  line: ProductionLineBrief;
};

async function updateLineCleanroom(
  lineId: string,
  hvac_cleanroom_class: string | null
) {
  const res = await fetch(`/api/production/lines/${lineId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hvac_cleanroom_class }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao gravar classe ISO");
}

export function ProductionLineCleanroomPanel({ line }: Props) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(
    line.hvac_cleanroom_class ?? ""
  );

  useEffect(() => {
    setValue(line.hvac_cleanroom_class ?? "");
  }, [line.hvac_cleanroom_class, line.id]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateLineCleanroom(line.id, value.trim() ? value.trim() : null),
    onSuccess: async () => {
      toast.success("Classe ISO da linha actualizada.");
      await qc.invalidateQueries({ queryKey: ["production-line", line.id] });
      await qc.invalidateQueries({ queryKey: ["production-lines"] });
      await qc.invalidateQueries({ queryKey: ["data-health"] });
      await qc.invalidateQueries({ queryKey: ["pcp-planning"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dirty =
    (value.trim() || null) !== (line.hvac_cleanroom_class?.trim() || null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 text-slate-800 shrink-0">
        <ShieldCheck className="h-4 w-4 text-brand-700" aria-hidden />
        <span className="text-sm font-semibold">Área classificada (ISO)</span>
      </div>
      <div className="flex flex-wrap items-end gap-2 min-w-[12rem] flex-1">
        <div className="space-y-1">
          <Label htmlFor={`line-iso-${line.id}`} className="text-xs">
            Classe da linha
          </Label>
          <select
            id={`line-iso-${line.id}`}
            className="min-h-[36px] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm min-w-[10rem]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">— Não cadastrada —</option>
            {HVAC_CLEANROOM_CLASSES.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Gravar ISO"
          )}
        </Button>
      </div>
      <p className="text-xs text-slate-500 w-full sm:w-auto sm:flex-1">
        OPs de produtos com sala ISO exigem linha igual ou mais limpa (ex.: produto
        ISO 7 → linha ISO 5, 6 ou 7).
      </p>
    </div>
  );
}

export type { HvacCleanroomClass };
