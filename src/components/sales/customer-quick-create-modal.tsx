"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  documentKindFromDigits,
  formatDocumentMask,
  onlyDigits,
  validateDocumentDigits,
} from "@/shared/utils/br-document";
import type { DocumentLookupResult } from "@/shared/utils/external/document-lookup";

export type CustomerOption = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  is_active?: boolean;
};

export type CustomerFormValues = {
  id?: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes?: string | null;
  is_active?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: CustomerOption) => void;
  /** Alias de `onCreated` (cadastro rápido no orçamento). */
  onCustomerCreated?: (customer: CustomerOption) => void;
  onUpdated?: (customer: CustomerOption) => void;
  /** Modo edição: envia PUT em vez de POST. */
  editCustomer?: CustomerFormValues | null;
};

async function lookupDocumentApi(
  digits: string,
  kind: "cpf" | "cnpj"
): Promise<DocumentLookupResult> {
  const path =
    kind === "cnpj"
      ? `/api/external/cnpj/${digits}`
      : `/api/external/cpf/${digits}`;
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: DocumentLookupResult;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro na consulta do documento");
  }
  if (!json.data?.name) throw new Error("Resposta inválida da consulta");
  return json.data;
}

async function saveCustomer(
  mode: "create" | "edit",
  id: string | undefined,
  payload: {
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes?: string | null;
    is_active?: boolean;
  }
): Promise<CustomerOption> {
  const url =
    mode === "edit" && id ? `/api/customers/${id}` : "/api/customers";
  const method = mode === "edit" && id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: CustomerOption;
    error?: string;
    detail?: unknown;
  };

  if (!res.ok) {
    console.error("[CustomerQuickCreateModal] falha ao guardar", {
      status: res.status,
      method,
      url,
      error: json.error,
      detail: json.detail,
      payload,
    });
    throw new Error(json.error ?? "Erro ao guardar cliente");
  }

  if (!json.data?.id) {
    console.error("[CustomerQuickCreateModal] resposta sem id", json);
    throw new Error("Resposta inválida ao criar cliente");
  }

  return json.data;
}

function normalizeDocumentForSave(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = onlyDigits(trimmed);
  if (!digits) return trimmed;
  if (digits.length === 11 || digits.length === 14) {
    const validation = validateDocumentDigits(digits);
    if (!validation.ok) return null;
    return formatDocumentMask(digits);
  }
  return trimmed;
}

export function CustomerQuickCreateModal({
  open,
  onOpenChange,
  onCreated,
  onCustomerCreated,
  onUpdated,
  editCustomer,
}: Props) {
  const isEdit = Boolean(editCustomer?.id);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editCustomer) {
      setName(editCustomer.name ?? "");
      setDocument(
        editCustomer.document
          ? formatDocumentMask(editCustomer.document)
          : ""
      );
      setEmail(editCustomer.email ?? "");
      setPhone(editCustomer.phone ?? "");
      setAddress(editCustomer.address ?? "");
      setNotes(editCustomer.notes ?? "");
    } else {
      setName("");
      setDocument("");
      setEmail("");
      setPhone("");
      setAddress("");
      setNotes("");
    }
    setError(null);
  }, [open, editCustomer]);

  if (!open) return null;

  const reset = () => {
    setName("");
    setDocument("");
    setEmail("");
    setPhone("");
    setAddress("");
    setNotes("");
    setError(null);
  };

  const handleClose = () => {
    if (busy || lookupBusy) return;
    reset();
    onOpenChange(false);
  };

  const applyLookup = (data: DocumentLookupResult) => {
    setName(data.name);
    setDocument(data.document_formatted);
    if (data.email?.trim()) setEmail(data.email.trim());
    if (data.phone?.trim()) setPhone(data.phone.trim());
    if (data.address?.trim()) setAddress(data.address.trim());
  };

  const handleLookup = async () => {
    const digits = onlyDigits(document);
    const validation = validateDocumentDigits(digits);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setLookupBusy(true);
    setError(null);
    try {
      const data = await lookupDocumentApi(digits, validation.kind);
      applyLookup(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao buscar dados do documento."
      );
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Nome é obrigatório.");
      return;
    }
    const docDigits = onlyDigits(document);
    if (
      docDigits.length > 0 &&
      docDigits.length !== 11 &&
      docDigits.length !== 14
    ) {
      setError(
        "Documento incompleto. Informe CPF (11 dígitos) ou CNPJ (14 dígitos), ou deixe em branco."
      );
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
      const payload = {
        name: n,
        document: normalizeDocumentForSave(document),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        ...(isEdit && notes.trim() ? { notes: notes.trim() } : {}),
        is_active: editCustomer?.is_active ?? true,
      };
      const row = await saveCustomer(
        isEdit ? "edit" : "create",
        editCustomer?.id,
        payload
      );
      if (isEdit) {
        onUpdated?.(row);
        toast.success("Cliente atualizado.");
      } else {
        const created: CustomerOption = {
          id: row.id,
          name: row.name,
          document: row.document ?? null,
          email: row.email ?? null,
          phone: row.phone ?? null,
          address: row.address ?? null,
          is_active: row.is_active ?? true,
        };
        onCreated?.(created);
        onCustomerCreated?.(created);
        toast.success(`Cliente «${created.name}» criado.`);
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao guardar cliente.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const digits = onlyDigits(document);
  const docKind = documentKindFromDigits(digits);
  const canLookup = docKind !== null && !lookupBusy && !busy;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-quick-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="customer-quick-title"
          className="text-lg font-semibold text-slate-900 mb-4"
        >
          {isEdit ? "Editar cliente" : "Novo cliente"}
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qc-doc">CNPJ / CPF</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="qc-doc"
                value={document}
                onChange={(e) =>
                  setDocument(formatDocumentMask(e.target.value))
                }
                placeholder="00.000.000/0000-00 ou 000.000.000-00"
                inputMode="numeric"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!canLookup}
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
              CNPJ: consulta Receita (BrasilAPI). CPF: quando o serviço estiver
              disponível.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qc-name">Nome *</Label>
            <Input
              id="qc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus={!document.trim()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qc-address">Endereço</Label>
            <Textarea
              id="qc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Rua, número, bairro, cidade…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="qc-email">E-mail</Label>
              <Input
                id="qc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qc-phone">Telefone</Label>
              <Input
                id="qc-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="qc-notes">Notas</Label>
              <Textarea
                id="qc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || lookupBusy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Guardar" : "Criar cliente"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
