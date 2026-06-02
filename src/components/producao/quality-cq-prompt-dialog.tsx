"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";

type Mode = "block" | "release";

type Props = {
  open: boolean;
  mode: Mode;
  itemLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
};

export function QualityCqPromptDialog({
  open,
  mode,
  itemLabel,
  pending = false,
  onClose,
  onConfirm,
}: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText("");
  }, [open, mode]);

  if (!open) return null;

  const title =
    mode === "block" ? "Bloquear finalização" : "Liberar finalização";
  const label =
    mode === "block"
      ? "Motivo do bloqueio (obrigatório)"
      : "Ação tomada na liberação (obrigatório)";
  const placeholder =
    mode === "block"
      ? "Descreva o motivo do bloqueio pelo CQ…"
      : "Descreva a tratativa / ação tomada…";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600 truncate" title={itemLabel}>
          {itemLabel}
        </p>
        <label className="block text-xs text-slate-600">
          {label}
          <Textarea
            className="mt-1 text-sm"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            disabled={pending}
          />
        </label>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !text.trim()}
            onClick={() => onConfirm(text.trim())}
          >
            {pending ? "A guardar…" : mode === "block" ? "Bloquear" : "Liberar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
