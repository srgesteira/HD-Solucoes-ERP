"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  documentKindFromDigits,
  formatDocumentMask,
  onlyDigits,
  validateDocumentDigits,
} from "@/lib/utils/br-document";
import { lookupDocumentClient } from "@/lib/suppliers/lookup-document-client";
import type { DocumentLookupResult } from "@/lib/external/document-lookup";

type Props = {
  document: string;
  onDocumentChange: (value: string) => void;
  onLookup: (data: DocumentLookupResult) => void;
  /** Toast + callback após preenchimento bem-sucedido. */
  onLookupSuccess?: (data: DocumentLookupResult) => void;
  disabled?: boolean;
  id?: string;
  /** Exibe toasts em erro/sucesso (padrão: true). */
  showToasts?: boolean;
};

export function SupplierDocumentLookup({
  document,
  onDocumentChange,
  onLookup,
  onLookupSuccess,
  disabled,
  id = "supplier-document",
  showToasts = true,
}: Props) {
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = onlyDigits(document);
  const docKind = documentKindFromDigits(digits);
  const validation =
    docKind !== null ? validateDocumentDigits(digits) : null;
  const canLookup =
    validation?.ok === true && !lookupBusy && !disabled;

  const handleLookup = async () => {
    const v = validateDocumentDigits(digits);
    if (!v.ok) {
      setError(v.error);
      if (showToasts) toast.error(v.error);
      return;
    }
    setLookupBusy(true);
    setError(null);
    try {
      const data = await lookupDocumentClient(digits, v.kind);
      onLookup(data);
      onLookupSuccess?.(data);
      if (showToasts) {
        toast.success("Dados do documento preenchidos.");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao buscar dados do documento.";
      setError(msg);
      if (showToasts) toast.error(msg);
    } finally {
      setLookupBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>CNPJ / CPF</Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          id={id}
          value={document}
          onChange={(e) => {
            setError(null);
            onDocumentChange(formatDocumentMask(e.target.value));
          }}
          placeholder="00.000.000/0000-00 ou 000.000.000-00"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled || lookupBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleLookup();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={!canLookup}
          title={
            docKind && validation && !validation.ok
              ? validation.error
              : docKind === null
                ? "Informe CPF (11) ou CNPJ (14 dígitos)"
                : undefined
          }
          onClick={() => void handleLookup()}
        >
          {lookupBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Buscar dados
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Informe o documento completo e clique em <strong>Buscar dados</strong>{" "}
        (ou Enter). CNPJ via BrasilAPI / ReceitaWS.
      </p>
      {docKind && validation && !validation.ok ? (
        <p className="text-xs text-amber-700">{validation.error}</p>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
