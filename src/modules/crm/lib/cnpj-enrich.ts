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

type CnpjWs = {
  razao_social?: string;
  simples?: { simples?: string; mei?: string } | null;
  estabelecimento?: {
    nome_fantasia?: string | null;
    tipo_logradouro?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cep?: string | null;
    email?: string | null;
    estado?: { sigla?: string } | null;
    cidade?: { nome?: string; ibge_id?: number } | null;
    atividade_principal?: { descricao?: string } | null;
    inscricoes_estaduais?: { inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }[];
  };
};

export type CnpjData = BrasilApiCnpj & { inscricao_estadual?: string | null };

async function fetchBrasilApi(cnpjDigits: string): Promise<CnpjData | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as CnpjData;
}

/** publica.cnpj.ws: aceita chamadas do servidor e traz a IE (limite ~3/min). */
async function fetchCnpjWs(cnpjDigits: string): Promise<CnpjData | null> {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjDigits}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as CnpjWs;
  const e = j.estabelecimento ?? {};
  const uf = e.estado?.sigla ?? null;
  const ies = (e.inscricoes_estaduais ?? []).filter((x) => x.ativo !== false && x.inscricao_estadual);
  const ie = ies.find((x) => (x.estado?.sigla ?? "") === uf) ?? ies[0];
  return {
    razao_social: j.razao_social,
    nome_fantasia: e.nome_fantasia ?? undefined,
    descricao_tipo_de_logradouro: e.tipo_logradouro ?? undefined,
    logradouro: e.logradouro ?? undefined,
    numero: e.numero ?? undefined,
    complemento: e.complemento ?? undefined,
    bairro: e.bairro ?? undefined,
    municipio: e.cidade?.nome,
    uf: uf ?? undefined,
    cep: e.cep ?? undefined,
    codigo_municipio_ibge: e.cidade?.ibge_id,
    opcao_pelo_simples: j.simples ? j.simples.simples === "Sim" : null,
    opcao_pelo_mei: j.simples ? j.simples.mei === "Sim" : null,
    email: e.email ?? null,
    cnae_fiscal_descricao: e.atividade_principal?.descricao ?? null,
    inscricao_estadual: ie?.inscricao_estadual?.replace(/\D/g, "") ?? null,
  };
}

/** BrasilAPI (bloqueia alguns servidores) → publica.cnpj.ws (com IE). */
export async function fetchCnpj(cnpjDigits: string): Promise<CnpjData | null> {
  try {
    const b = await fetchBrasilApi(cnpjDigits);
    if (b) return b;
  } catch {
    /* tenta a próxima */
  }
  try {
    return await fetchCnpjWs(cnpjDigits);
  } catch {
    return null;
  }
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Devolve só os campos que estão vazios no cliente e a Receita tem. */
export function buildEnrichPatch(c: CustomerRow, r: CnpjData): Record<string, unknown> {
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
  if (!c.state_registration && !c.icms_taxpayer && r.inscricao_estadual !== undefined) {
    if (r.inscricao_estadual) patch.state_registration = r.inscricao_estadual;
    else patch.icms_taxpayer = 9; // sem IE ativa = não contribuinte
  }
  setIfEmpty("email", r.email?.toLowerCase());
  return patch;
}
