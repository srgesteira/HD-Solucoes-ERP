"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Supplier } from "@/lib/types/purchasing.types";

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

/** Payload JSON para POST/PUT na API de fornecedores. */
export function buildSupplierPayload(form: SupplierFormShape) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    legal_name: trimOrNull(form.legal_name),
    document: trimOrNull(form.document),
    email: trimOrNull(form.email),
    phone: trimOrNull(form.phone),
    website: trimOrNull(form.website),
    address_street: trimOrNull(form.address_street),
    address_number: trimOrNull(form.address_number),
    address_complement: trimOrNull(form.address_complement),
    address_neighborhood: trimOrNull(form.address_neighborhood),
    address_city: trimOrNull(form.address_city),
    address_state: trimOrNull(form.address_state),
    address_zip: trimOrNull(form.address_zip),
    contact_person: trimOrNull(form.contact_person),
    payment_terms: trimOrNull(form.payment_terms),
    delivery_terms: trimOrNull(form.delivery_terms),
    notes: trimOrNull(form.notes),
    is_active: form.is_active,
  };
}

/** Preenche o formulário a partir da linha devolvida pelo GET. */
export function supplierRowToForm(row: Supplier): SupplierFormShape {
  const s = (v: string | null | undefined) => (v ?? "").trim();
  return {
    code: s(row.code),
    name: s(row.name),
    legal_name: s(row.legal_name),
    document: s(row.document),
    email: s(row.email),
    phone: s(row.phone),
    website: s(row.website),
    address_street: s(row.address_street),
    address_number: s(row.address_number),
    address_complement: s(row.address_complement),
    address_neighborhood: s(row.address_neighborhood),
    address_city: s(row.address_city),
    address_state: s(row.address_state),
    address_zip: s(row.address_zip),
    contact_person: s(row.contact_person),
    payment_terms: s(row.payment_terms),
    delivery_terms: s(row.delivery_terms),
    notes: s(row.notes),
    is_active: Boolean(row.is_active),
  };
}

export type SupplierFormShape = {
  code: string;
  name: string;
  legal_name: string;
  document: string;
  email: string;
  phone: string;
  website: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  contact_person: string;
  payment_terms: string;
  delivery_terms: string;
  notes: string;
  is_active: boolean;
};

export const emptySupplierForm = (): SupplierFormShape => ({
  code: "",
  name: "",
  legal_name: "",
  document: "",
  email: "",
  phone: "",
  website: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  contact_person: "",
  payment_terms: "",
  delivery_terms: "",
  notes: "",
  is_active: true,
});

type Props = {
  formData: SupplierFormShape;
  onChange<K extends keyof SupplierFormShape>(
    field: K,
    value: SupplierFormShape[K]
  ): void;
};

export function SupplierFormFields({ formData, onChange }: Props) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 border-b border-slate-200 pb-2">
          Identificação
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-code">Código *</Label>
            <Input
              id="supplier-code"
              value={formData.code}
              onChange={(e) =>
                onChange("code", e.target.value.toUpperCase())
              }
              placeholder="Ex.: FORN-001"
              required
              autoComplete="off"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-name">Nome *</Label>
            <Input
              id="supplier-name"
              value={formData.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="Nome de exibição"
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-legal-name">Razão social</Label>
            <Input
              id="supplier-legal-name"
              value={formData.legal_name}
              onChange={(e) => onChange("legal_name", e.target.value)}
              placeholder="Razão social (opcional)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-document">Documento (CNPJ / CPF)</Label>
            <Input
              id="supplier-document"
              value={formData.document}
              onChange={(e) => onChange("document", e.target.value)}
              placeholder="Somente números ou formato completo"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 border-b border-slate-200 pb-2">
          Contacto e site
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-email">E-mail</Label>
            <Input
              id="supplier-email"
              type="email"
              value={formData.email}
              onChange={(e) => onChange("email", e.target.value)}
              placeholder="contacto@empresa.com.br"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-phone">Telefone</Label>
            <Input
              id="supplier-phone"
              value={formData.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              placeholder="DDD + número"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-website">Site</Label>
            <Input
              id="supplier-website"
              type="text"
              inputMode="url"
              value={formData.website}
              onChange={(e) => onChange("website", e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 border-b border-slate-200 pb-2">
          Endereço
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-address-street">Rua / logradouro</Label>
            <Input
              id="supplier-address-street"
              value={formData.address_street}
              onChange={(e) => onChange("address_street", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-address-number">Número</Label>
            <Input
              id="supplier-address-number"
              value={formData.address_number}
              onChange={(e) => onChange("address_number", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-address-zip">CEP</Label>
            <Input
              id="supplier-address-zip"
              value={formData.address_zip}
              onChange={(e) => onChange("address_zip", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-address-complement">Complemento</Label>
            <Input
              id="supplier-address-complement"
              value={formData.address_complement}
              onChange={(e) => onChange("address_complement", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-address-neighborhood">Bairro</Label>
            <Input
              id="supplier-address-neighborhood"
              value={formData.address_neighborhood}
              onChange={(e) =>
                onChange("address_neighborhood", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-address-city">Cidade</Label>
            <Input
              id="supplier-address-city"
              value={formData.address_city}
              onChange={(e) => onChange("address_city", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-address-state">Estado</Label>
            <Input
              id="supplier-address-state"
              value={formData.address_state}
              onChange={(e) => onChange("address_state", e.target.value.toUpperCase())}
              placeholder="UF"
              maxLength={2}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 border-b border-slate-200 pb-2">
          Negócio
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-contact-person">Pessoa de contacto</Label>
            <Input
              id="supplier-contact-person"
              value={formData.contact_person}
              onChange={(e) => onChange("contact_person", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-payment-terms">
              Condições de pagamento
            </Label>
            <Textarea
              id="supplier-payment-terms"
              value={formData.payment_terms}
              onChange={(e) => onChange("payment_terms", e.target.value)}
              rows={2}
              className="resize-y min-h-[3rem]"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-delivery-terms">
              Condições de entrega
            </Label>
            <Textarea
              id="supplier-delivery-terms"
              value={formData.delivery_terms}
              onChange={(e) => onChange("delivery_terms", e.target.value)}
              rows={2}
              className="resize-y min-h-[3rem]"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-notes">Observações</Label>
            <Textarea
              id="supplier-notes"
              value={formData.notes}
              onChange={(e) => onChange("notes", e.target.value)}
              rows={4}
              className="resize-y min-h-[5rem]"
            />
          </div>
          <label className="flex items-center gap-2 md:col-span-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-700"
              checked={formData.is_active}
              onChange={(e) => onChange("is_active", e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-800">Ativo</span>
          </label>
        </div>
      </div>
    </div>
  );
}
