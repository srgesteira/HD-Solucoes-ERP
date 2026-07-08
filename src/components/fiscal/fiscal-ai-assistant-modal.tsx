"use client";

import { Loader2, Sparkles } from "lucide-react";
import type { FiscalOrderAiResultStatus } from "@/modules/fiscal/lib/fiscal-order-ai.service";
import { Button } from "@/shared/ui/button";

export type FiscalAiAssistantResponse = {
  status: FiscalOrderAiResultStatus;
  summary: string;
  questions: string[];
  fiscalStatus?: string;
};

type Props = {
  open: boolean;
  orderLabel?: string;
  loading: boolean;
  description: string;
  questions: string[];
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function FiscalAiAssistantModal({
  open,
  orderLabel,
  loading,
  description,
  questions,
  onDescriptionChange,
  onClose,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assistente fiscal (IA)
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {orderLabel ? (
            <>
              Pedido <strong>{orderLabel}</strong> —{" "}
            </>
          ) : null}
          Usado quando <strong>não há regra fiscal cadastrada</strong>. A IA define
          CFOP, alíquotas e impostos; se faltar contexto, faz perguntas (consumidor,
          revenda, industrialização, UF, etc.).
        </p>

        {questions.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Preciso que confirme:</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <textarea
          className="mt-3 w-full min-h-[120px] rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Ex.: Cliente em SP, operação de revenda, produto para revenda no mesmo estado…"
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={loading} onClick={onSubmit}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {questions.length > 0 ? "Responder e aplicar" : "Aplicar fiscal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
