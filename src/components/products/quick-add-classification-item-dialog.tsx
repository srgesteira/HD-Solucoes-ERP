"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import type { ClassificationOption } from "@/components/products/classification-select-with-add";

export type QuickAddClassificationConfig = {
  title: string;
  contextHint?: string;
  codeLabel?: string;
  codePlaceholder?: string;
  namePlaceholder?: string;
  validateCode: (code: string) => string | null;
  buildBody: (fields: {
    code: string;
    name: string;
    description: string | null;
  }) => Record<string, unknown>;
  postUrl: string;
};

type Props = {
  open: boolean;
  config: QuickAddClassificationConfig;
  onClose: () => void;
  onCreated: (row: ClassificationOption) => void;
};

export function QuickAddClassificationItemDialog({
  open,
  config,
  onClose,
  onCreated,
}: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setDescription("");
      setError(null);
      setPending(false);
    }
  }, [open, config.title]);

  if (!open || !mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    const codeErr = config.validateCode(code);
    if (codeErr) {
      setError(codeErr);
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nome é obrigatório.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch(config.postUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          config.buildBody({
            code: code.trim().toUpperCase(),
            name: trimmedName,
            description: description.trim() || null,
          })
        ),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: ClassificationOption;
      };

      if (!res.ok) {
        const msg =
          json.error ??
          "Não foi possível guardar. Verifique os dados e tente novamente.";
        setError(msg);
        toast.error(msg);
        return;
      }

      if (!json.data?.id) {
        const msg = "Resposta inválida do servidor (sem identificador).";
        setError(msg);
        toast.error(msg);
        return;
      }

      onCreated(json.data);
      onClose();
    } catch {
      const msg = "Erro de rede. Verifique a ligação e tente novamente.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-classification-title"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
      >
        <h3
          id="quick-add-classification-title"
          className="text-lg font-semibold text-slate-900"
        >
          {config.title}
        </h3>
        {config.contextHint ? (
          <p className="text-xs text-slate-600 leading-relaxed">
            {config.contextHint}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="quick_add_code">{config.codeLabel ?? "Código *"}</Label>
          <Input
            id="quick_add_code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={config.codePlaceholder ?? "Ex.: A"}
            maxLength={4}
            required
            disabled={pending}
            className="font-mono uppercase"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick_add_name">Nome *</Label>
          <Input
            id="quick_add_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={config.namePlaceholder ?? "Nome descritivo"}
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick_add_desc">Descrição (opcional)</Label>
          <Textarea
            id="quick_add_desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={pending}
          />
        </div>

        {error ? (
          <p className="text-sm text-red-600 font-medium" role="alert">
            {error}
          </p>
        ) : null}

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
            type="submit"
            size="sm"
            disabled={pending || !code.trim() || !name.trim()}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden />
                A guardar…
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
      </form>
    </div>,
    document.body
  );
}
