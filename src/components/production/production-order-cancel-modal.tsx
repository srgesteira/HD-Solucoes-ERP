"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  PRODUCTION_CANCELLATION_REASON_LABELS,
  PRODUCTION_CANCELLATION_REASONS,
  type ProductionCancellationReason,
} from "@/modules/reverse/lib/returns-types";

type Props = {
  open: boolean;
  orderNumber: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    reason: ProductionCancellationReason;
    notes: string | null;
  }) => void;
};

export function ProductionOrderCancelModal({
  open,
  orderNumber,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] =
    useState<ProductionCancellationReason>("customer_cancelled");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("customer_cancelled");
    setNotes("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Ban className="h-5 w-5 text-red-700" />
          Cancelar OP {orderNumber}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          §10.2 — a OP será marcada como cancelada. Histórico de apontamento
          fica preservado para custo. Material já consumido NÃO volta
          automaticamente; faça ajuste manual se aplicável.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label>Motivo</Label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as ProductionCancellationReason)
              }
            >
              {PRODUCTION_CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {PRODUCTION_CANCELLATION_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="cancel-op-notes">Notas (opcional)</Label>
            <Textarea
              id="cancel-op-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes da decisão"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() =>
              onSubmit({
                reason,
                notes: notes.trim() ? notes.trim() : null,
              })
            }
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
            Confirmar cancelamento
          </Button>
        </div>
      </div>
    </div>
  );
}
