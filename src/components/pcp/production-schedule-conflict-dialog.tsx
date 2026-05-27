"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ProductionScheduleConflict = {
  message: string | null;
  max_purchase_delivery: string | null;
  blocking_component: string | null;
  suggested_production_end: string | null;
};

type Props = {
  open: boolean;
  conflict: ProductionScheduleConflict;
  fieldLabel: string;
  attemptedDate: string | null;
  onAdjust: (suggestedEnd: string) => void;
  onKeep: (note: string) => void;
  onClose: () => void;
};

function formatBr(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function ProductionScheduleConflictDialog({
  open,
  conflict,
  fieldLabel,
  attemptedDate,
  onAdjust,
  onKeep,
  onClose,
}: Props) {
  const [note, setNote] = useState("");

  if (!open) return null;

  const comp = conflict.blocking_component ?? "componente";
  const pcDate = formatBr(conflict.max_purchase_delivery);
  const attempted = formatBr(attemptedDate);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Conflito com entrega de compras
        </h3>
        <p className="text-sm text-slate-600">
          A data de {fieldLabel} ({attempted}) é anterior à entrega do componente{" "}
          <strong>{comp}</strong> prevista para <strong>{pcDate}</strong>. Deseja
          mesmo assim? (pode causar atraso na produção)
        </p>
        {conflict.message ? (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2">
            {conflict.message}
          </p>
        ) : null}
        <label className="block text-xs text-slate-600">
          Justificativa (obrigatória se mantiver)
          <Textarea
            className="mt-1 text-sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo para manter a data…"
          />
        </label>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!conflict.suggested_production_end}
            onClick={() => {
              if (conflict.suggested_production_end) {
                onAdjust(conflict.suggested_production_end);
              }
            }}
          >
            Ajustar produção
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => onKeep(note.trim())}
          >
            Manter mesmo assim
          </Button>
        </div>
      </div>
    </div>
  );
}
