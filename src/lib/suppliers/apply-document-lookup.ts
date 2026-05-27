import type { DocumentLookupResult } from "@/lib/external/document-lookup";
import { formatDocumentMask, onlyDigits } from "@/lib/utils/br-document";
import type { SupplierFormShape } from "@/components/purchasing/supplier-form-fields";

/** Gera código interno a partir do documento (CNPJ/CPF). */
export function suggestSupplierCode(documentDigits: string): string {
  const d = onlyDigits(documentDigits);
  if (d.length === 14) return `F${d.slice(0, 8)}`;
  if (d.length === 11) return `F${d.slice(0, 8)}`;
  return `FORN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Preenche campos do formulário de fornecedor com dados da consulta externa. */
export function applyDocumentLookupToSupplierForm(
  form: SupplierFormShape,
  data: DocumentLookupResult,
  options?: { autoCode?: boolean }
): SupplierFormShape {
  const next: SupplierFormShape = { ...form };
  next.name = data.name.trim();
  next.document = data.document_formatted;
  if (data.trade_name?.trim()) {
    next.legal_name = data.trade_name.trim();
  }
  if (data.email?.trim()) next.email = data.email.trim();
  if (data.phone?.trim()) next.phone = data.phone.trim();

  const parts = data.address_parts;
  if (parts) {
    if (parts.street) next.address_street = parts.street;
    if (parts.number) next.address_number = parts.number;
    if (parts.complement) next.address_complement = parts.complement;
    if (parts.neighborhood) next.address_neighborhood = parts.neighborhood;
    if (parts.city) next.address_city = parts.city;
    if (parts.state) next.address_state = parts.state;
    if (parts.zip) next.address_zip = parts.zip;
  }

  if (options?.autoCode && !next.code.trim()) {
    next.code = suggestSupplierCode(data.document);
  }

  return next;
}

export function normalizeSupplierDocumentForSave(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = onlyDigits(trimmed);
  if (!digits) return trimmed;
  if (digits.length === 11 || digits.length === 14) {
    return formatDocumentMask(digits);
  }
  return trimmed;
}
