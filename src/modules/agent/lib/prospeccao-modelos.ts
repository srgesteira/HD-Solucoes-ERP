/**
 * Modelos de e-mail do robô Prospector (aprovados pelo Helder em 17/11/2026).
 * Primeira pessoa (Helder). A assinatura do Zoho é acrescentada pelo envio.
 * Mudou algum texto? Mude aqui — o robô passa a usar na próxima rodada.
 */

export type Passo = "1o" | "fu1" | "fu2";

type Segmento = {
  chave: string;
  palavras: RegExp;
  assunto: string;
  oferta: string;
  curto: string;
  link: string;
};

const SITE = "https://www.hdindustrial.ind.br";

export const SEGMENTOS: Segmento[] = [
  {
    chave: "hvac",
    palavras: /(instalad|vrf|pmoc|ar[- ]?condicionad|climatiza|refrigera|hvac|projet|manuten)/i,
    assunto: "Painéis de filtragem FXSQ/FXMQ e caixas de filtragem sob medida",
    oferta:
      "Para instaladoras e projetistas, fabricamos painéis de filtragem para evaporadoras Daikin FXSQ/FXMQ, caixas de filtragem e de ventilação e UTAs, desenhados para cada obra.",
    curto: "painéis de filtragem, caixas de filtragem ou UTAs",
    link: `${SITE}/equipamentos/fxsq`,
  },
  {
    chave: "farma",
    palavras: /(farma|manipula|cosm[eé]t|veterin|biotec|vacina)/i,
    assunto: "Fluxo laminar, cabine de pesagem e caixas terminais HEPA sob medida",
    oferta:
      "Para farma, manipulação e cosméticos, fabricamos fluxo laminar, cabine de pesagem, caixas terminais HEPA e BIBO, projetados para atender a ISO 14644-1 e a IN 35/2019.",
    curto: "fluxo laminar, cabine de pesagem ou caixas terminais HEPA",
    link: `${SITE}/especificacoes`,
  },
  {
    chave: "validacao",
    palavras: /(valida|qualifica|hospital|laborat|pesquisa|cl[ií]nic)/i,
    assunto: "Caixas terminais HEPA com porta de teste, FFU e fluxo laminar",
    oferta:
      "Para validação, hospitais e laboratórios, fornecemos caixas terminais HEPA com porta de teste, FFU e fluxo laminar, e podemos ser parceiros nas obras dos seus clientes.",
    curto: "caixas terminais HEPA, FFU ou fluxo laminar",
    link: `${SITE}/especificacoes`,
  },
  {
    chave: "industria",
    palavras: /(aliment|eletr[oô]n|automot|embalag|pintura|ind[uú]stri)/i,
    assunto: "Filtragem e ventilação industrial sob medida",
    oferta:
      "Para a indústria, fazemos caixas de filtragem e de ventilação, UTAs e filtros G4, F7/F9 e HEPA, sob medida para a sua linha.",
    curto: "caixas de filtragem e ventilação, UTAs ou filtros",
    link: `${SITE}/equipamentos`,
  },
  {
    chave: "revenda",
    palavras: /(revend|distribui|filtro|construt|montad|sala[s]? limpa)/i,
    assunto: "Fabricação sob medida para revendas e montadoras de salas limpas",
    oferta:
      "Para revendas e montadoras de salas limpas, fabricamos sob encomenda FFU, caixas terminais HEPA, fluxo laminar e caixas de filtragem, com prazo combinado por obra.",
    curto: "FFU, caixas terminais HEPA ou fluxo laminar",
    link: `${SITE}/equipamentos`,
  },
];

const GERAL: Segmento = {
  chave: "geral",
  palavras: /.*/,
  assunto: "Equipamentos sob medida para salas limpas e HVAC industrial",
  oferta:
    "Fazemos fluxo laminar, FFU, caixas terminais HEPA, caixas de filtragem e ventilação e UTAs, e também fornecemos filtros G4, F7/F9 e HEPA.",
  curto: "equipamentos de filtragem ou salas limpas",
  link: SITE,
};

export function segmentoDe(texto: string | null | undefined): Segmento {
  const t = String(texto ?? "");
  return SEGMENTOS.find((s) => s.palavras.test(t)) ?? GERAL;
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

export function montarEmail(args: {
  passo: Passo;
  nome: string | null;
  segmento: string | null;
  gancho: string | null;
  assuntoAnterior: string | null;
}): { assunto: string; texto: string } {
  const s = segmentoDe(args.segmento);
  const ola = args.nome ? `Olá, ${args.nome},` : "Olá,";

  if (args.passo === "1o") {
    const frase = frasePronta(args.gancho);
    return {
      assunto: s.assunto,
      texto: [
        ola,
        "",
        ...(frase ? [frase, ""] : []),
        `Sou o Helder, da HD Industrial, fabricante em São Paulo de equipamentos sob medida para salas limpas e HVAC industrial. ${s.oferta}`,
        "",
        `Dá uma olhada: ${s.link}`,
        "",
        "Se fizer sentido, posso fazer uma visita técnica sem compromisso ou ajudar no memorial descritivo do próximo projeto.",
        "",
        "Abraço,",
      ].join("\n"),
    };
  }

  const assunto = args.assuntoAnterior
    ? /^re:/i.test(args.assuntoAnterior) ? args.assuntoAnterior : `Re: ${args.assuntoAnterior}`
    : `${s.assunto} — HD Industrial`;
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
