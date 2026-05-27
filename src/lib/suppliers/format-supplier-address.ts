import type { SupplierFormShape } from "@/components/purchasing/supplier-form-fields";

/** Uma linha legível do endereço estruturado do fornecedor. */
export function formatSupplierAddressLine(form: Pick<
  SupplierFormShape,
  | "address_street"
  | "address_number"
  | "address_complement"
  | "address_neighborhood"
  | "address_city"
  | "address_state"
  | "address_zip"
>): string {
  const parts: string[] = [];
  const street = form.address_street.trim();
  if (street) {
    let line = street;
    if (form.address_number.trim()) line += `, ${form.address_number.trim()}`;
    if (form.address_complement.trim()) line += ` — ${form.address_complement.trim()}`;
    parts.push(line);
  }
  const cityLine = [
    form.address_neighborhood.trim(),
    form.address_city.trim(),
    form.address_state.trim(),
    form.address_zip.trim(),
  ]
    .filter(Boolean)
    .join(" — ");
  if (cityLine) parts.push(cityLine);
  return parts.join(" · ");
}
