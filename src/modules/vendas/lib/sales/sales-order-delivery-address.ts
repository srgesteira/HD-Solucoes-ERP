export const BRAZIL_UF_CODES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export type BrazilUf = (typeof BRAZIL_UF_CODES)[number];

export type SalesOrderDeliveryAddress = {
  delivery_address_different: boolean;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_complement: string | null;
  delivery_neighborhood: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
};

export const EMPTY_DELIVERY_ADDRESS: SalesOrderDeliveryAddress = {
  delivery_address_different: false,
  delivery_street: null,
  delivery_number: null,
  delivery_complement: null,
  delivery_neighborhood: null,
  delivery_city: null,
  delivery_state: null,
  delivery_zip: null,
};

export const SALES_ORDER_DELIVERY_FIELD_KEYS = [
  "delivery_address_different",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_neighborhood",
  "delivery_city",
  "delivery_state",
  "delivery_zip",
] as const;

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t ? t : null;
}

export function digitsOnlyZip(value: string | null | undefined): string | null {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length ? d : null;
}

export function formatCepDisplay(zip: string | null | undefined): string {
  const d = digitsOnlyZip(zip);
  if (!d) return "";
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}

export function isBrazilUf(value: string): value is BrazilUf {
  return (BRAZIL_UF_CODES as readonly string[]).includes(value);
}

export function deliveryAddressFromRow(
  row:
    | (Partial<Omit<SalesOrderDeliveryAddress, "delivery_address_different">> & {
        delivery_address_different?: boolean | null;
      })
    | null
    | undefined
): SalesOrderDeliveryAddress {
  if (!row) return { ...EMPTY_DELIVERY_ADDRESS };
  return {
    delivery_address_different: row.delivery_address_different === true,
    delivery_street: trimOrNull(row.delivery_street),
    delivery_number: trimOrNull(row.delivery_number),
    delivery_complement: trimOrNull(row.delivery_complement),
    delivery_neighborhood: trimOrNull(row.delivery_neighborhood),
    delivery_city: trimOrNull(row.delivery_city),
    delivery_state: trimOrNull(row.delivery_state)?.toUpperCase() ?? null,
    delivery_zip: digitsOnlyZip(row.delivery_zip),
  };
}

/** Uma linha para ecrã / observações da NF. */
export function formatDeliveryAddressOneLine(
  addr: SalesOrderDeliveryAddress
): string | null {
  if (!addr.delivery_address_different) return null;
  const street = [addr.delivery_street, addr.delivery_number]
    .filter(Boolean)
    .join(", ");
  const parts = [
    street,
    addr.delivery_complement,
    addr.delivery_neighborhood,
    addr.delivery_city,
    addr.delivery_state,
    addr.delivery_zip ? formatCepDisplay(addr.delivery_zip) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" — ") : null;
}

export function validateDeliveryAddress(
  addr: SalesOrderDeliveryAddress
): string | null {
  if (!addr.delivery_address_different) return null;
  if (!addr.delivery_street) return "Informe a rua do endereço de entrega.";
  if (!addr.delivery_number) return "Informe o número do endereço de entrega.";
  if (!addr.delivery_neighborhood) {
    return "Informe o bairro do endereço de entrega.";
  }
  if (!addr.delivery_city) return "Informe a cidade do endereço de entrega.";
  const uf = (addr.delivery_state ?? "").toUpperCase();
  if (!isBrazilUf(uf)) return "Informe a UF do endereço de entrega.";
  const zip = digitsOnlyZip(addr.delivery_zip) ?? "";
  if (zip.length !== 8) return "CEP de entrega inválido (8 dígitos).";
  return null;
}

export function parseSalesOrderDeliveryAddressBody(
  b: Record<string, unknown>
):
  | { ok: true; skip: true }
  | { ok: true; skip: false; value: SalesOrderDeliveryAddress }
  | { ok: false; message: string } {
  const mentioned = SALES_ORDER_DELIVERY_FIELD_KEYS.some(
    (k) => b[k] !== undefined
  );
  if (!mentioned) return { ok: true, skip: true };

  const different = b.delivery_address_different === true;
  if (!different) {
    return { ok: true, skip: false, value: { ...EMPTY_DELIVERY_ADDRESS } };
  }

  const value = deliveryAddressFromRow({
    delivery_address_different: true,
    delivery_street: trimOrNull(b.delivery_street),
    delivery_number: trimOrNull(b.delivery_number),
    delivery_complement: trimOrNull(b.delivery_complement),
    delivery_neighborhood: trimOrNull(b.delivery_neighborhood),
    delivery_city: trimOrNull(b.delivery_city),
    delivery_state: trimOrNull(b.delivery_state),
    delivery_zip: trimOrNull(b.delivery_zip),
  });
  const err = validateDeliveryAddress(value);
  if (err) return { ok: false, message: err };
  return { ok: true, skip: false, value };
}
