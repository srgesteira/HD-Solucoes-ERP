"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";

type ChecklistExecutionItem = {
  id: string;
  sequence: number;
  label: string;
  detail: string | null;
  is_required: boolean;
  completion: { completed: boolean } | null;
};

type Props = {
  open: boolean;
  orderItemId: string;
  itemLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (completions: Array<{ checklist_item_id: string; completed: boolean }>) => void;
};

async function fetchSummary(orderItemId: string) {
  const res = await fetch(
    `/api/hvac/checklist-completions?order_item_id=${encodeURIComponent(orderItemId)}`,
    { credentials: "include", cache: "no-store" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    summary?: { items: ChecklistExecutionItem[] };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar checklist");
  return json.summary?.items ?? [];
}

export function HvacChecklistExecutionDialog({
  open,
  orderItemId,
  itemLabel,
  pending = false,
  onClose,
  onConfirm,
}: Props) {
  const query = useQuery({
    queryKey: ["hvac-checklist-execution", orderItemId],
    queryFn: () => fetchSummary(orderItemId),
    enabled: open && Boolean(orderItemId),
  });

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const item of query.data ?? []) {
      next[item.id] = item.completion?.completed === true;
    }
    setChecked(next);
  }, [open, query.data]);

  if (!open) return null;

  const items = query.data ?? [];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-900">
          Checklist POP HEPA
        </h3>
        <p className="text-sm text-slate-600 truncate" title={itemLabel}>
          {itemLabel}
        </p>

        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar itens…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Este produto não tem checklist POP configurado na engenharia.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-slate-200 px-3 py-2"
              >
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked[item.id] === true}
                    disabled={pending}
                    onChange={(e) =>
                      setChecked((prev) => ({
                        ...prev,
                        [item.id]: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium text-slate-900">
                      {item.sequence}. {item.label}
                      {item.is_required ? (
                        <span className="text-amber-800 text-xs ml-1">
                          (obrigatório)
                        </span>
                      ) : null}
                    </span>
                    {item.detail ? (
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {item.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

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
            disabled={pending || query.isLoading || items.length === 0}
            onClick={() =>
              onConfirm(
                items.map((item) => ({
                  checklist_item_id: item.id,
                  completed: checked[item.id] === true,
                }))
              )
            }
          >
            Gravar checklist
          </Button>
        </div>
      </div>
    </div>
  );
}
