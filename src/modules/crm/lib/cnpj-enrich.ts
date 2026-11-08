import "server-only";

/**
 * Completa o cadastro do cliente pelo CNPJ (Receita via BrasilAPI): endereço separado,
 * código IBGE, UF, CEP e regime (Simples/MEI). IE não vem da Receita — fica como está.
 * Só preenche campos vazios (nunca sobrescreve o que foi digitado).
 */

type BrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  descricao_tipo_de_logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string | number;
  codigo_municipio_ibge?: number | string;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
  email?: string | null;
  ddd_telefone_1?: string | null;
  cnae_fiscal_descricao?: string | null;
};

export type CustomerRow = Record<string, unknown> & { id: string; document: string | null };

export async function fetchCnpj(cnpjDigits: string): Promise<BrasilApiCnpj | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as BrasilApiCnpj;
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Devolve só os campos que estão vazios no cliente e a Receita tem. */
export function buildEnrichPatch(c: CustomerRow, r: BrasilApiCnpj): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const setIfEmpty = (key: string, value: unknown) => {
    const v = clean(value);
    if (v != null && (c[key] == null || String(c[key]).trim() === "")) patch[key] = v;
  };
  const street = [clean(r.descricao_tipo_de_logradouro), clean(r.logradouro)].filter(Boolean).join(" ");
  setIfEmpty("trade_name", r.nome_fantasia);
  setIfEmpty("address_street", street);
  setIfEmpty("address_number", r.numero);
  setIfEmpty("address_complement", r.complemento);
  setIfEmpty("address_neighborhood", r.bairro);
  setIfEmpty("address_city", r.municipio);
  setIfEmpty("address_state", clean(r.uf)?.toUpperCase().slice(0, 2));
  const cep = clean(r.cep)?.replace(/\D/g, "");
  setIfEmpty("address_zip", cep && cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep);
  setIfEmpty("ibge_city_code", r.codigo_municipio_ibge);
  if (!c.tax_regime) {
    if (r.opcao_pelo_mei) patch.tax_regime = "mei";
    else if (r.opcao_pelo_simples) patch.tax_regime = "simples";
  }
  if (!c.segment) setIfEmpty("segment", r.cnae_fiscal_descricao);
  setIfEmpty("email", r.email?.toLowerCase());
  return patch;
}
