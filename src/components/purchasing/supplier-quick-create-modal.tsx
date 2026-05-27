"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupplierDocumentLookup } from "@/components/purchasing/supplier-document-lookup";
import {
  buildSupplierPayload,
  emptySupplierForm,
  type SupplierFormShape,
} from "@/components/purchasing/supplier-form-fields";
import {
  applyDocumentLookupToSupplierForm,
  normalizeSupplierDocumentForSave,
} from "@/lib/suppliers/apply-document-lookup";
import { formatSupplierAddressLine } from "@/lib/suppliers/format-supplier-address";
import { onlyDigits, validateDocumentDigits } from "@/lib/utils/br-document";
import type { DocumentLookupResult } from "@/lib/external/document-lookup";

export type SupplierOption = {
  id: string;
  code: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  is_active?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (supplier: SupplierOption) => void;
};

export function SupplierQuickCreateModal({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [form, setForm] = useState<SupplierFormShape>(emptySupplierForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptySupplierForm());
    setError(null);
  }, [open]);

  if (!open) return null;

  const setField = <K extends keyof SupplierFormShape>(
    field: K,
    value: SupplierFormShape[K]
  ) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleClose = () => {
    if (busy) return;
    onOpenChange(false);
  };

  const applyLookup = (data: DocumentLookupResult) => {
    setForm((f) => applyDocumentLookupToSupplierForm(f, data, { autoCode: true }));
  };

  const addressLine = formatSupplierAddressLine(form);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code || !name) {
      setError("CÃ³digo e nome sÃ£o obrigatÃ³rios.");
      return;
    }
    const docDigits = onlyDigits(form.document);
    if (
      docDigits.length > 0 &&
      docDigits.length !== 11 &&
      docDigits.length !== 14
    ) {
      setError("Documento incompleto (CPF 11 ou CNPJ 14 dÃ­gitos).");
      return;
    }
    if (docDigits.length === 11 || docDigits.length === 14) {
      const validation = validateDocumentDigits(docDigits);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const payload = buildSupplierPayload({
        ...form,
        document: form.document.trim()
          ? normalizeSupplierDocumentForSave(form.document) ??
            form.document.trim()
          : "",
      });
      const res = await fetch("/api/purchasing/suppliers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: SupplierOption;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao criar fornecedor");
      }
      if (!json.data?.id) throw new Error("Resposta invÃ¡lida ao criar fornecedor");

      const created: SupplierOption = {
        id: json.data.id,
        code: json.data.code,
        name: json.data.name,
        document: json.data.document ?? null,
        email: json.data.email ?? null,
        phone: json.data.phone ?? null,
        is_active: json.data.is_active ?? true,
      };
      onCreated?.(created);
      toast.success(`Fornecedor Â«${created.name}Â» criado.`);
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao criar fornecedor.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-quick-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="supplier-quick-title"
          className="text-lg font-semibold text-slate-900 mb-4"
        >
          Novo fornecedor
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <SupplierDocumentLookup
            document={form.document}
            onDocumentChange={(v) => setField("document", v)}
            onLookup={applyLookup}
            disabled={busy}
            id="sqc-doc"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sqc-name">Nome *</Label>
              <Input
                id="sqc-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="RazÃ£o social"
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sqc-code">CÃ³digo *</Label>
              <Input
                id="sqc-code"
                value={form.code}
                onChange={(e) =>
                  setField("code", e.target.value.toUpperCase())
                }
                placeholder="Gerado na busca ou manual"
                required
                disabled={busy}
              />
            </div>
            {form.legal_name.trim() ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sqc-legal">Nome fantasia</Label>
                <Input
                  id="sqc-legal"
                  value={form.legal_name}
                  onChange={(e) => setField("legal_name", e.target.value)}
                  disabled={busy}
                />
              </div>
            ) : null}
          </div>

          {addressLine ? (
            <p className="text-xs text-slate-600 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="font-medium text-slate-700">EndereÃ§o: </span>
              {addressLine}
            </p>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sqc-email">E-mail</Label>
              <Input
                id="sqc-email"
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sqc-phone">Telefone</Label>
              <Input
                id="sqc-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar fornecedor
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

