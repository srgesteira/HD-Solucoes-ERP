"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

type Props = {
  open: boolean;
  quoteNumber: string;
  defaultRecipient: string;
  defaultMessage?: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (recipients: string[], message: string | null) => void;
};

export function QuoteSendEmailModal({
  open,
  quoteNumber,
  defaultRecipient,
  defaultMessage,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setRecipientsRaw(defaultRecipient ?? "");
    setMessage(defaultMessage ?? "");
  }, [open, defaultRecipient, defaultMessage]);

  if (!open) return null;

  const handleSubmit = () => {
    const list = recipientsRaw
      .split(/[\s;,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    onSubmit(list, message.trim() ? message.trim() : null);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-send-email-title"
    >
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
        <h3
          id="quote-send-email-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Enviar orçamento por e-mail
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Orçamento <strong>{quoteNumber}</strong> — o PDF será gerado e
          anexado automaticamente.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="quote-email-to">Destinatário(s)</Label>
            <Input
              id="quote-email-to"
              type="text"
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="cliente@exemplo.com (separe múltiplos por vírgula)"
              disabled={busy}
            />
            <p className="mt-1 text-xs text-slate-500">
              Pode informar mais de um e-mail separando por vírgula.
            </p>
          </div>

          <div>
            <Label htmlFor="quote-email-msg">Mensagem (opcional)</Label>
            <Textarea
              id="quote-email-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Personalize a mensagem que acompanha o e-mail. Em branco, será usado um texto padrão."
              rows={4}
              disabled={busy}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={busy || recipientsRaw.trim().length === 0}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
