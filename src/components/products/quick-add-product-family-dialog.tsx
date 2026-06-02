"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

export type ProductFamilyListRow = {
  id: string;
  code: string;
  name: string;
  sort_order?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (row: ProductFamilyListRow) => void;
};

export function QuickAddProductFamilyDialog({
  open,
  onClose,
  onCreated,
}: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setDescription("");
      setError(null);
      setPending(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/products/families", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          description: description.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: ProductFamilyListRow;
      };
      if (!res.ok) {
        setError(json.error ?? "Erro ao criar família");
        return;
      }
      if (!json.data?.id) {
        setError("Resposta inválida do servidor");
        return;
      }
      onCreated(json.data);
      onClose();
    } catch {
      setError("Erro de rede ao criar família");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-family-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
      >
        <h3
          id="add-family-title"
          className="text-lg font-semibold text-slate-900"
        >
          Nova família
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Código curto usado no código técnico (ex.:{" "}
          <span className="font-mono">A</span>, <span className="font-mono">B</span>
          ). Letras e números, até 4 caracteres.
        </p>

        <div className="space-y-2">
          <Label htmlFor="family_code">Código *</Label>
          <Input
            id="family_code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex.: H"
            maxLength={4}
            required
            disabled={pending}
            className="font-mono uppercase"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="family_name">Nome *</Label>
          <Input
            id="family_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Novo grupo de produtos"
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="family_desc">Descrição (opcional)</Label>
          <Textarea
            id="family_desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={pending}
          />
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
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
          <Button type="submit" size="sm" disabled={pending || !code.trim() || !name.trim()}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden />
                A guardar…
              </>
            ) : (
              "Adicionar família"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
