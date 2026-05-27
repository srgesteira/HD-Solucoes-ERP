import {
  formatDocumentMask,
  onlyDigits,
  validateDocumentDigits,
  type DocumentKind,
} from "@/lib/utils/br-document";

export type DocumentAddressParts = {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type DocumentLookupResult = {
  kind: DocumentKind;
  document: string;
  document_formatted: string;
  name: string;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_parts: DocumentAddressParts | null;
};

function joinAddress(parts: (string | null | undefined)[]): string | null {
  const cleaned = parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.join(", ");
}

function formatCep(cep: string | null | undefined): string | null {
  const d = onlyDigits(cep ?? "");
  if (d.length !== 8) return cep?.trim() || null;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function documentAddressPartsFromInput(input: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): DocumentAddressParts {
  const trim = (v: string | null | undefined) => {
    const t = v?.trim();
    return t?.length ? t : null;
  };
  return {
    street: trim(input.street),
    number: trim(input.number),
    complement: trim(input.complement),
    neighborhood: trim(input.neighborhood),
    city: trim(input.city),
    state: trim(input.state)?.toUpperCase().slice(0, 2) ?? null,
    zip: formatCep(input.zip),
  };
}

function buildAddressFromParts(input: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const parts = documentAddressPartsFromInput(input);
  const streetLine = joinAddress([
    parts.street,
    parts.number ? `nº ${parts.number}` : null,
    parts.complement,
  ]);
  const cityLine = joinAddress([
    parts.neighborhood,
    parts.city,
    parts.state,
    parts.zip,
  ]);
  return joinAddress([streetLine, cityLine]);
}

function normalizePhone(...parts: (string | null | undefined)[]): string | null {
  for (const p of parts) {
    const trimmed = p?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

type BrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string | null;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
};

async function lookupCnpjBrasilApi(cnpj: string): Promise<DocumentLookupResult | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `BrasilAPI indisponível (${res.status})${text ? `: ${text.slice(0, 120)}` : ""}`
    );
  }
  const j = (await res.json()) as BrasilApiCnpj;
  const name = (j.razao_social ?? j.nome_fantasia ?? "").trim();
  if (!name) return null;
  const phone = normalizePhone(j.ddd_telefone_1, j.ddd_telefone_2);
  const address_parts = documentAddressPartsFromInput({
    street: j.logradouro,
    number: j.numero,
    complement: j.complemento,
    neighborhood: j.bairro,
    city: j.municipio,
    state: j.uf,
    zip: j.cep,
  });
  return {
    kind: "cnpj",
    document: cnpj,
    document_formatted: formatDocumentMask(cnpj),
    name,
    trade_name: j.nome_fantasia?.trim() || null,
    email: j.email?.trim() || null,
    phone,
    address: buildAddressFromParts(address_parts),
    address_parts,
  };
}

type ReceitaWsCnpj = {
  status?: string;
  message?: string;
  nome?: string;
  fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
  telefone?: string;
};

async function lookupCnpjReceitaWs(cnpj: string): Promise<DocumentLookupResult | null> {
  const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as ReceitaWsCnpj;
  if (j.status === "ERROR") {
    throw new Error(j.message ?? "CNPJ não encontrado na ReceitaWS.");
  }
  const name = (j.nome ?? j.fantasia ?? "").trim();
  if (!name) return null;
  const address_parts = documentAddressPartsFromInput({
    street: j.logradouro,
    number: j.numero,
    complement: j.complemento,
    neighborhood: j.bairro,
    city: j.municipio,
    state: j.uf,
    zip: j.cep,
  });
  return {
    kind: "cnpj",
    document: cnpj,
    document_formatted: formatDocumentMask(cnpj),
    name,
    trade_name: j.fantasia?.trim() || null,
    email: j.email?.trim() || null,
    phone: j.telefone?.trim() || null,
    address: buildAddressFromParts(address_parts),
    address_parts,
  };
}

export async function lookupCnpj(cnpjDigits: string): Promise<DocumentLookupResult> {
  const validation = validateDocumentDigits(cnpjDigits);
  if (!validation.ok || validation.kind !== "cnpj") {
    throw new Error(validation.ok ? "CNPJ inválido." : validation.error);
  }

  try {
    const fromBrasil = await lookupCnpjBrasilApi(cnpjDigits);
    if (fromBrasil) return fromBrasil;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("429") || msg.includes("503")) {
      // rate limit — tenta fallback
    } else if (!msg.includes("404")) {
      try {
        const fromReceita = await lookupCnpjReceitaWs(cnpjDigits);
        if (fromReceita) return fromReceita;
      } catch (inner) {
        throw inner instanceof Error ? inner : e;
      }
      throw e instanceof Error ? e : new Error("Erro ao consultar CNPJ.");
    }
  }

  try {
    const fromReceita = await lookupCnpjReceitaWs(cnpjDigits);
    if (fromReceita) return fromReceita;
  } catch (e) {
    throw e instanceof Error ? e : new Error("Erro ao consultar CNPJ.");
  }

  throw new Error("CNPJ não encontrado ou serviço indisponível. Tente mais tarde.");
}

type BrasilApiCpf = {
  nome?: string;
  cpf?: string;
  situacao?: string;
};

/** Consulta CPF via BrasilAPI (quando disponível). */
export async function lookupCpf(cpfDigits: string): Promise<DocumentLookupResult> {
  const validation = validateDocumentDigits(cpfDigits);
  if (!validation.ok || validation.kind !== "cpf") {
    throw new Error(validation.ok ? "CPF inválido." : validation.error);
  }

  const res = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpfDigits}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404 || res.status === 501) {
    throw new Error(
      "Consulta de CPF não disponível neste momento. Preencha os dados manualmente."
    );
  }

  if (!res.ok) {
    throw new Error(
      `Serviço de CPF indisponível (${res.status}). Preencha os dados manualmente.`
    );
  }

  const j = (await res.json()) as BrasilApiCpf;
  const name = j.nome?.trim();
  if (!name) {
    throw new Error("CPF não encontrado. Preencha os dados manualmente.");
  }

  return {
    kind: "cpf",
    document: cpfDigits,
    document_formatted: formatDocumentMask(cpfDigits),
    name,
    trade_name: null,
    email: null,
    phone: null,
    address: null,
    address_parts: null,
  };
}

export async function lookupDocument(
  rawDocument: string
): Promise<DocumentLookupResult> {
  const digits = onlyDigits(rawDocument);
  const validation = validateDocumentDigits(digits);
  if (!validation.ok) throw new Error(validation.error);
  if (validation.kind === "cnpj") return lookupCnpj(digits);
  return lookupCpf(digits);
}
