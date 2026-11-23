/**
 * Modelos de e-mail do robô Prospector — 4 modelos APROVADOS pelo Helder em 22/11/2026
 * (fonte: Desktop\AGENTES\COHD\modelos-prospeccao.md). Primeira pessoa (Helder).
 * O e-mail termina em "Abraço," — nome, cargo e links vêm da assinatura do Zoho.
 * Regras: citar só classes G1 a H14 (destaque HEPA); nunca EPA/ULPA; nunca citar cliente nem obra.
 * Mudou algum texto? Mude aqui e no modelos-prospeccao.md — o robô passa a usar na próxima rodada.
 */

export type Passo = "1o" | "fu1" | "fu2";

type Segmento = {
  chave: string;
  palavras: RegExp;
  /** Assunto do 1º contato; {empresa} é trocado pelo nome da empresa. */
  assunto: string;
  /** Corpo do 1º contato, sem saudação e sem "Abraço,"; {empresa} é trocado pelo nome da empresa. */
  corpo: string[];
  /** Usado nos follow-ups: "... que envolva {curto} ...". */
  curto: string;
};

const SITE = "https://www.hdindustrial.ind.br";

/** Modelo 1 — Engenharias de sala limpa (também é o modelo padrão quando o segmento não bate). */
const ENGENHARIA: Segmento = {
  chave: "engenharia",
  palavras: /(engenhar|projet|sala[s]? limpa|valida|qualifica|farma|manipula|hospital|laborat|biotec|vacina|cosm[eé]t)/i,
  assunto: "Caixas de filtragem e filtros HEPA para os projetos da {empresa}",
  corpo: [
    "Sou o Helder, da HD Industrial. Há mais de 23 anos fabricamos equipamentos para salas limpas e ambientes críticos: caixas de filtragem HEPA, BIBO (troca segura), fan filters, plenums e filtros do G1 ao H14, com destaque para os filtros absolutos HEPA, sob medida para cada projeto.",
    "",
    "Para engenharias como a {empresa}, entregamos a caixa do jeito que o projeto pede: dimensões, vazão, perda de carga e acabamento. Também deixamos ferramentas gratuitas para projetistas no nosso site (especificações técnicas e calculadoras):",
    `${SITE}/especificacoes`,
    "",
    "Se tiver alguma obra em cotação, mande o escopo que eu devolvo com prazo e preço.",
  ],
  curto: "caixas de filtragem HEPA, BIBO, fan filters ou filtros",
};

/** Modelo 2 — Manutenção de ar-condicionado (HVAC). */
const HVAC: Segmento = {
  chave: "hvac",
  palavras: /(instalad|pmoc|ar[- ]?condicionad|climatiza|refrigera|hvac|manuten)/i,
  assunto: "Filtros e caixas de filtragem direto da fábrica para a {empresa}",
  corpo: [
    "Sou o Helder, da HD Industrial. Há mais de 23 anos fabricamos e vendemos filtros de ar do G1 ao H14 (grossos, médios, finos e os absolutos HEPA), além de caixas de filtragem e painéis sob medida.",
    "",
    "Para a {empresa}, isso significa comprar direto da fábrica os filtros e as caixas que os seus contratos pedem, tanto para a reposição periódica quanto para trocar a classe de filtragem. Fazemos também as medidas fora do padrão, que costumam faltar no mercado e atrasar a troca.",
    "",
    `Conheça a linha completa: ${SITE}`,
    "",
    "Se tiver uma lista de reposição ou um pedido em vista, mande as medidas e as classes que eu devolvo com prazo e preço.",
  ],
  curto: "filtros de reposição ou caixas de filtragem",
};

/** Modelo 3 — Painéis FXSQ (VRF). */
const FXSQ: Segmento = {
  chave: "fxsq",
  palavras: /(fxsq|fxmq|vrf|vrv|daikin)/i,
  assunto: "Painel com filtro para evaporadoras de duto FXSQ — {empresa}",
  corpo: [
    "Sou o Helder, da HD Industrial. Fabricamos o painel de retorno com filtro para evaporadoras de duto FXSQ (VRF), com filtro G4 articulado que sai sem desmontar o forro. A troca fica rápida e a manutenção não depende de abrir o teto.",
    "",
    "Atendemos de poucas peças a lotes grandes, nas medidas das máquinas do seu cliente. Além dos painéis, fabricamos caixas de filtragem e filtros G4 a HEPA há mais de 23 anos.",
    "",
    `Conheça a HD: ${SITE}`,
    "",
    "Se tiver obra ou contrato com FXSQ, me diga os modelos e as quantidades que eu passo prazo e preço.",
  ],
  curto: "painéis com filtro para evaporadoras FXSQ",
};

/** Modelo 4 — Obras novas (construtoras, engenharias e indústrias montando instalações). */
const OBRAS: Segmento = {
  chave: "obras",
  palavras: /(constru|incorporad|obra[s]? nova|nova instala|amplia|expans|nova f[aá]brica|nova planta)/i,
  assunto: "Painéis, caixas de filtragem e filtros sob medida para a nova instalação da {empresa}",
  corpo: [
    "Sou o Helder, da HD Industrial. Há mais de 23 anos fabricamos equipamentos de filtragem de ar para ambientes críticos: painéis, caixas de filtragem HEPA, BIBO (troca segura), fan filters e filtros do G1 ao H14, com destaque para os filtros absolutos HEPA.",
    "",
    "Numa obra nova, fabricamos cada peça sob medida, a partir do projeto, e combinamos as entregas com o cronograma da obra, para que o equipamento chegue quando a montagem precisa dele. Cada filtro sai com a classe especificada no projeto, do pré-filtro G4 ao HEPA H14.",
    "",
    `Conheça a HD: ${SITE}`,
    `Especificações técnicas para o projeto: ${SITE}/especificacoes`,
    "",
    "Se a {empresa} estiver com a filtragem da instalação em cotação, mande o projeto ou a lista de equipamentos que eu devolvo com prazo e preço.",
  ],
  curto: "painéis, caixas de filtragem ou filtros para a obra",
};

/** Ordem de teste: do mais específico ao mais geral. Sem acerto → Modelo 1 (engenharia). */
export const SEGMENTOS: Segmento[] = [FXSQ, OBRAS, HVAC, ENGENHARIA];

export function segmentoDe(texto: string | null | undefined): Segmento {
  const t = String(texto ?? "");
  return SEGMENTOS.find((s) => s.palavras.test(t)) ?? ENGENHARIA;
}

/**
 * Frase personalizada só entra se foi escrita PARA O CLIENTE, marcada com "Frase:" no gancho
 * (ex.: "Frase: Vi que a Acme está ampliando a fábrica de Jundiaí."). Gancho sem "Frase:" é nota interna.
 */
function frasePronta(gancho: string | null | undefined): string {
  const m = String(gancho ?? "").match(/Frase:\s*(.+)$/i);
  if (!m) return "";
  const g = m[1].trim();
  return g.length > 15 && g.length < 300 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(g) && /[.!]$/.test(g) && !/https?:\/\//.test(g) ? g : "";
}

function comEmpresa(texto: string, empresa: string): string {
  return texto.replace(/\{empresa\}/g, empresa);
}

export function montarEmail(args: {
  passo: Passo;
  nome: string | null;
  empresa: string | null;
  segmento: string | null;
  gancho: string | null;
  assuntoAnterior: string | null;
}): { assunto: string; texto: string } {
  const s = segmentoDe(args.segmento);
  const empresa = String(args.empresa ?? "").trim() || "sua empresa";
  // Regra do modelos-prospeccao.md: com nome → "Olá, {nome}, tudo bem?"; sem nome → "Olá, equipe {empresa},".
  const ola = args.nome ? `Olá, ${args.nome}, tudo bem?` : `Olá, equipe ${empresa},`;

  if (args.passo === "1o") {
    const frase = frasePronta(args.gancho);
    return {
      assunto: comEmpresa(s.assunto, empresa),
      texto: [ola, "", ...(frase ? [frase, ""] : []), ...s.corpo.map((l) => comEmpresa(l, empresa)), "", "Abraço,"].join("\n"),
    };
  }

  const assunto = args.assuntoAnterior
    ? /^re:/i.test(args.assuntoAnterior) ? args.assuntoAnterior : `Re: ${args.assuntoAnterior}`
    : comEmpresa(s.assunto, empresa);
  if (args.passo === "fu1") {
    return {
      assunto,
      texto: [
        ola,
        "",
        `Passando só para saber se o meu e-mail da semana passada chegou até você. Se tiver algum projeto ou manutenção que envolva ${s.curto}, posso mandar uma proposta ou fazer uma visita técnica.`,
        "",
        "Abraço,",
      ].join("\n"),
    };
  }
  return {
    assunto,
    texto: [
      ola,
      "",
      `Último contato por aqui, para não ocupar sua caixa. Se em algum momento precisar de ${s.curto}, ou de ajuda no memorial descritivo de um projeto, é só responder este e-mail.`,
      "",
      "Abraço,",
    ].join("\n"),
  };
}
