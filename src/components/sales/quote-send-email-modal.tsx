"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

/** Payload enviado ao POST /api/sales/quotes/[id]/send-email. */
export type QuoteSendEmailPayload =
  | {
      mode: "zoho";
      to: string[];
      cc: string[];
      subject: string;
      body: string;
    }
  | { mode: "legacy"; to: string[]; message: string | null };

type Draft = {
  zohoConfigured: boolean;
  from: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
};

type Props = {
  open: boolean;
  quoteId: string;
  quoteNumber: string;
  defaultRecipient: string;
  defaultMessage?: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: QuoteSendEmailPayload) => void;
};

function splitEmails(raw: string): string[] {
  return raw
    .split(/[\s;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function QuoteSendEmailModal({
  open,
  quoteId,
  quoteNumber,
  defaultRecipient,
  defaultMessage,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [zohoConfigured, setZohoConfigured] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [ccRaw, setCcRaw] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRecipientsRaw(defaultRecipient ?? "");
    setCcRaw("");
    setSubject("");
    setBody("");
    setMessage(defaultMessage ?? "");
    setDraftError(null);
    setZohoConfigured(false);
    setFrom(null);
    setLoadingDraft(true);
    void (async () => {
      try {
        const res = await fetch(`/api/sales/quotes/${quoteId}/send-email`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as Partial<Draft> & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDraftError(json.error ?? "Não foi possível preparar o e-mail.");
          return;
        }
        setZohoConfigured(Boolean(json.zohoConfigured));
        setFrom(json.from ?? null);
        if (Array.isArray(json.to) && json.to.length > 0) {
          setRecipientsRaw(json.to.join(", "));
        }
        if (Array.isArray(json.cc)) setCcRaw(json.cc.join(", "));
        setSubject(json.subject ?? "");
        setBody(json.body ?? "");
      } catch {
        if (!cancelled) setDraftError("Não foi possível preparar o e-mail.");
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, quoteId, defaultRecipient, defaultMessage]);

  if (!open) return null;

  const recipients = splitEmails(recipientsRaw);
  const canSubmit =
    !busy &&
    !loadingDraft &&
    recipients.length > 0 &&
    (!zohoConfigured || (subject.trim().length > 0 && body.trim().length > 0));

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (zohoConfigured) {
      onSubmit({
        mode: "zoho",
        to: recipients,
        cc: splitEmails(ccRaw),
        subject: subject.trim(),
        body,
      });
    } else {
      onSubmit({
        mode: "legacy",
        to: recipients,
        message: message.trim() ? message.trim() : null,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-send-email-title"
    >
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
        <h3
          id="quote-send-email-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Enviar orçamento por e-mail
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Orçamento <strong>{quoteNumber}</strong> — o PDF será gerado e
          anexado automaticamente. Revise os dados antes de confirmar.
        </p>

        {loadingDraft ? (
          <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparando e-mail…
          </div>
        ) : (
          <>
            {draftError ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {draftError}
              </p>
            ) : null}

            {!zohoConfigured && !draftError ? (
              <div className="mt-4 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Zoho não configurado.</strong> O envio segue o caminho
                  anterior (SMTP da empresa ou Resend) e pode ser apenas
                  simulado. Veja docs/ZOHO-SETUP.md.
                </span>
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              {zohoConfigured && from ? (
                <div>
                  <Label>De</Label>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {from} <span className="text-slate-400">(Zoho Mail)</span>
                  </p>
                </div>
              ) : null}

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

              {zohoConfigured ? (
                <>
                  <div>
                    <Label htmlFor="quote-email-cc">Cópia (Cc)</Label>
                    <Input
                      id="quote-email-cc"
                      type="text"
                      value={ccRaw}
                      onChange={(e) => setCcRaw(e.target.value)}
                      placeholder="opcional — separe múltiplos por vírgula"
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <Label htmlFor="quote-email-subject">Assunto</Label>
                    <Input
                      id="quote-email-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={500}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <Label htmlFor="quote-email-body">Corpo do e-mail</Label>
                    <Textarea
                      id="quote-email-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={12}
                      disabled={busy}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Texto simples; linhas em branco separam parágrafos.
                    </p>
                  </div>
                </>
              ) : (
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
              )}
            </div>
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {zohoConfigured ? "Confirmar e enviar" : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
