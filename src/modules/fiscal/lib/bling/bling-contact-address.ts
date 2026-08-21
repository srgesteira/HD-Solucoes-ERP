import { BRAZIL_UF_CODES } from "@/modules/vendas/lib/sales/sales-order-delivery-address";
import type { DocumentAddressParts } from "@/shared/utils/external/document-lookup";

export type BlingEnderecoPayload = {
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
};

const UF_SET = new Set<string>(BRAZIL_UF_CODES);

function trimPart(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cepDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function blingEnderecoFromParts(
  parts: DocumentAddressParts | null | undefined
): BlingEnderecoPayload | null {
  if (!parts) return null;
  const endereco = trimPart(parts.street);
  const municipio = trimPart(parts.city);
  const uf = trimPart(parts.state).toUpperCase().slice(0, 2);
  const cep = cepDigits(parts.zip);
  if (!endereco || !municipio || !UF_SET.has(uf) || cep.length !== 8) {
    return null;
  }
  const complemento = trimPart(parts.complement);
  return {
    endereco,
    numero: trimPart(parts.number) || "S/N",
    ...(complemento ? { complemento } : {}),
    bairro: trimPart(parts.neighborhood) || "Centro",
    municipio,
    uf,
    cep,
  };
}

/**
 * Inverte o formato gravado no pedido:
 * `Rua, nº 123, complemento, Bairro, Cidade, UF, 00000-000`
 */
export function parseFreeformAddressToBling(
  raw: string | null | undefined
): BlingEnderecoPayload | null {
  const text = trimPart(raw);
  if (!text) return null;

  const cepMatch = text.match(/\b(\d{5})[\s\-.]?(\d{3})\b/);
  const cep = cepMatch ? `${cepMatch[1]}${cepMatch[2]}` : "";
  const withoutCep = text
    .replace(/\b\d{5}[\s\-.]?\d{3}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "");

  const tokens = withoutCep
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let uf = "";
  const ufIdx = [...tokens]
    .map((t, i) => ({ t: t.toUpperCase(), i }))
    .reverse()
    .find((row) => UF_SET.has(row.t) && row.t.length === 2);
  if (ufIdx) {
    uf = ufIdx.t;
    tokens.splice(ufIdx.i, 1);
  }

  let numero = "";
  const numIdx = tokens.findIndex((t) =>
    /^(n[º°o.]?|nro|num(ero)?)\s*\.?\s*\d+/i.test(t)
  );
  if (numIdx >= 0) {
    const m = tokens[numIdx].match(/(\d+[A-Za-z\-/]*)/);
    numero = m?.[1] ?? "";
    tokens.splice(numIdx, 1);
  } else {
    const inline = tokens[0]?.match(/\b(?:n[º°o.]?)\s*(\d+[A-Za-z\-/]*)/i);
    if (inline) {
      numero = inline[1];
      tokens[0] = tokens[0].replace(inline[0], "").trim();
    }
  }

  let municipio = "";
  let bairro = "";
  let complemento = "";
  let endereco = "";

  if (tokens.length >= 3) {
    municipio = tokens[tokens.length - 1] ?? "";
    bairro = tokens[tokens.length - 2] ?? "";
    endereco = tokens[0] ?? "";
    complemento = tokens.slice(1, -2).join(", ");
  } else if (tokens.length === 2) {
    endereco = tokens[0] ?? "";
    municipio = tokens[1] ?? "";
  } else {
    endereco = tokens[0] ?? "";
  }

  endereco = trimPart(endereco);
  municipio = trimPart(municipio);
  if (!endereco || !municipio || !UF_SET.has(uf) || cep.length !== 8) {
    return null;
  }
  return {
    endereco,
    numero: numero || "S/N",
    ...(trimPart(complemento) ? { complemento: trimPart(complemento) } : {}),
    bairro: trimPart(bairro) || "Centro",
    municipio,
    uf,
    cep,
  };
}
