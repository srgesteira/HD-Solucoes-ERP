"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";

type Reason = { id: string; reason: string };

type Props = {
  open: boolean;
  quoteNumber: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reasonIds: string[], notes: string) => void;
};

export function QuoteRejectModal({
  open,
  quoteNumber,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setNotes("");
    setLoading(true);
    void fetch("/api/sales/quotes/rejection-reasons", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: Reason[] }) => setReasons(j.data ?? []))
      .catch(() => setReasons([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-reject-title"
    >
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
        <h3
          id="quote-reject-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Rejeitar orçamento
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Orçamento <strong>{quoteNumber}</strong> — indique o(s) motivo(s).
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar motivos…
          </p>
        ) : (
          <ul className="mt-4 space-y-2 max-h-48 overflow-y-auto">
            {reasons.map((r) => (
              <li key={r.id}>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span>{r.reason}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <Label htmlFor="reject-notes">Observações</Label>
          <textarea
            id="reject-notes"
            className="mt-1 w-full min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalhes adicionais (opcional)"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={busy || selected.size === 0}
            onClick={() => onSubmit([...selected], notes.trim())}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A guardar…
              </>
            ) : (
              "Confirmar rejeição"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
