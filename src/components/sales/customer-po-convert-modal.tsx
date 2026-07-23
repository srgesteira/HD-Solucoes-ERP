"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type Props = {
  open: boolean;
  quoteLabel?: string | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (customerPoNumber: string) => void;
};

/**
 * Pedido de compra do cliente — obrigatório ao converter orçamento em PV
 * (informação que segue para a NF-e).
 */
export function CustomerPoConvertModal({
  open,
  quoteLabel,
  busy = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Informe o n.º do pedido de compra do cliente.");
      return;
    }
    if (trimmed.length > 60) {
      setError("Máximo 60 caracteres.");
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[102] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-po-convert-title"
    >
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
        <div>
          <h3
            id="customer-po-convert-title"
            className="text-lg font-semibold text-slate-900"
          >
            Pedido de compra do cliente
          </h3>
          <p className="mt-1.5 text-sm text-slate-600">
            Ao gerar o pedido de venda
            {quoteLabel ? (
              <>
                {" "}
                a partir de <strong>{quoteLabel}</strong>
              </>
            ) : null}
            , informe o n.º do pedido de compra do cliente. Este dado entra na
            nota fiscal.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-po-number">
            N.º do pedido de compra do cliente *
          </Label>
          <Input
            id="customer-po-number"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Ex.: OC-12345 / PC-2026-001"
            disabled={busy}
            autoFocus
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Criar pedido de venda
          </Button>
        </div>
      </div>
    </div>
  );
}
