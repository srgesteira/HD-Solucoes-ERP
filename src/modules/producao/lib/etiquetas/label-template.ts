/**
 * Etiquetas de produção 100×20 mm (Argox) — mesma tecnologia do PCP Control da HEPA,
 * adaptada à HD: modelo salvo por produto (products.label_template).
 *
 * Modelos:
 *  - painel          → painel / equipamento (código, descrição, medida, pedido, série)
 *  - filtro_completa → filtro F/H (vazão, classe, ΔPi, ΔPf, "não torcer", seta de fluxo)
 *  - filtro_simples  → filtro G/M ou sem classe
 *
 * Um painel pode levar filtros: filtros_por_unidade > 0 imprime também
 * as etiquetas dos filtros (qtd do item × filtros por unidade).
 */

export type LabelModelo = "painel" | "filtro_completa" | "filtro_simples";
export type FiltroModelo = "filtro_completa" | "filtro_simples";

export type LabelTemplate = {
  modelo: LabelModelo;
  /** Texto livre extra no painel (ex.: "220V · 60Hz", "Ventilação: 1.200 m³/h"). */
  linha_extra?: string;
  /** Campos do filtro (quando o próprio item é filtro). */
  classe?: string;
  vazao?: string;
  perda_inicial?: string;
  perda_final?: string;
  /** Painel com filtros embarcados. */
  filtros_por_unidade?: number;
  filtro_codigo?: string;
  filtro_descricao?: string;
  filtro_modelo?: FiltroModelo;
  filtro_classe?: string;
  filtro_vazao?: string;
  filtro_perda_inicial?: string;
  filtro_perda_final?: string;
};

/**
 * Formato físico de cada família de etiqueta (rolo + impressora).
 * Painel e filtro têm tamanhos diferentes → saem em impressões separadas.
 */
export type LabelFormato = {
  largura_mm: number;
  altura_mm: number;
  impressora: string;
};

export const LABEL_FORMATOS: Record<"painel" | "filtro", LabelFormato> = {
  painel: { largura_mm: 50, altura_mm: 30, impressora: "" },
  filtro: { largura_mm: 100, altura_mm: 20, impressora: "Elgin L42 Pro" },
};

export function familiaDoModelo(m: LabelModelo): "painel" | "filtro" {
  return m === "painel" ? "painel" : "filtro";
}

export const LABEL_MODELO_LABELS: Record<LabelModelo, string> = {
  painel: "Painel / equipamento",
  filtro_completa: "Filtro completa (F/H)",
  filtro_simples: "Filtro simples (G/M)",
};

const CLASSES = [
  "H14",
  "H13",
  "H12",
  "H11",
  "H10",
  "E12",
  "E11",
  "E10",
  "F9",
  "F8",
  "F7",
  "M6",
  "M5",
  "G4",
  "G3",
] as const;

/** Classe de filtragem a partir de código/descrição (ex.: "... F8 ..." → F8). */
export function detectarClasseFiltragem(
  descricao: string,
  codigo?: string | null
): string | null {
  const texto = ` ${codigo ?? ""} ${descricao} `.toUpperCase();
  if (/H13\s*\/\s*H14/.test(texto)) return "H13/H14";
  for (const c of CLASSES) {
    if (new RegExp(`(^|[^A-Z0-9])${c}([^0-9]|$)`).test(texto)) return c;
  }
  return null;
}

/** F/H/E → completa; G/M ou sem classe → simples. */
export function decidirModeloFiltro(classe: string | null | undefined): FiltroModelo {
  const c = (classe ?? "").trim().toUpperCase();
  if (c.startsWith("F") || c.startsWith("H") || c.startsWith("E")) {
    return "filtro_completa";
  }
  return "filtro_simples";
}

function isFiltro(descricao: string, codigo?: string | null): boolean {
  const t = `${codigo ?? ""} ${descricao}`.toUpperCase();
  if (/\bPAINEL\b|\bPLENUM\b|\bCAIXA\b|\bFLUXO\b|\bFFU\b|\bGABINETE\b|\bUTA\b/.test(t)) {
    return false;
  }
  return /\bFILTRO\b|\bHEPA\b|\bHF-/.test(t);
}

/** Modelo padrão quando o produto ainda não tem modelo salvo. */
export function detectarTemplatePadrao(
  descricao: string,
  codigo?: string | null
): LabelTemplate {
  const classe = detectarClasseFiltragem(descricao, codigo);
  if (isFiltro(descricao, codigo)) {
    return { modelo: decidirModeloFiltro(classe), classe: classe ?? "" };
  }
  return { modelo: "painel" };
}

/** Lê o jsonb salvo, tolerante a campos faltando/lixo. */
export function parseLabelTemplate(raw: unknown): LabelTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const modelo = r.modelo;
  if (modelo !== "painel" && modelo !== "filtro_completa" && modelo !== "filtro_simples") {
    return null;
  }
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : undefined);
  const n = Number(r.filtros_por_unidade);
  const fm = r.filtro_modelo;
  return {
    modelo,
    linha_extra: s("linha_extra"),
    classe: s("classe"),
    vazao: s("vazao"),
    perda_inicial: s("perda_inicial"),
    perda_final: s("perda_final"),
    filtros_por_unidade: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    filtro_codigo: s("filtro_codigo"),
    filtro_descricao: s("filtro_descricao"),
    filtro_modelo:
      fm === "filtro_completa" || fm === "filtro_simples" ? fm : undefined,
    filtro_classe: s("filtro_classe"),
    filtro_vazao: s("filtro_vazao"),
    filtro_perda_inicial: s("filtro_perda_inicial"),
    filtro_perda_final: s("filtro_perda_final"),
  };
}

const DIMENSAO_RE = /(\d+)\s*[xX×]\s*(\d+)(?:\s*[xX×]\s*(\d+))?\s*(?:mm|MM)?/;

/** Medida tipo 610X610X292MM (ou 2 dimensões). */
export function medidaFromDescricao(descricao: string): string | null {
  const m = descricao.match(DIMENSAO_RE);
  if (!m) return null;
  return m[3] ? `${m[1]}X${m[2]}X${m[3]}MM` : `${m[1]}X${m[2]}MM`;
}

export function descricaoSemMedida(descricao: string): string {
  return descricao.replace(DIMENSAO_RE, "").replace(/\s+/g, " ").trim();
}

/** Lote = AAMMDD-PEDIDO (igual para o pedido inteiro, como na HEPA). */
export function gerarLote(numeroPedido: string, data = new Date()): string {
  const yy = String(data.getFullYear()).slice(-2);
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  // PV-2026-0031 → 0031 (o lote já fica curto e cabe na etiqueta)
  const num = numeroPedido.trim().replace(/^[A-Z]{1,3}-\d{4}-/i, "");
  return `${yy}${mm}${dd}-${num}`;
}

export type ParseSeriesResult =
  | { ok: true; numeros: number[] }
  | { ok: false; error: string };

/** "7" ou "7, 12, 15" → [7,12,15]; vazio → [] (todas). */
export function parseSeriesReimpressao(input: string, total: number): ParseSeriesResult {
  const t = input.trim();
  const max = Math.max(1, Math.floor(total));
  if (!t) return { ok: true, numeros: [] };
  const nums: number[] = [];
  for (const p of t.split(/[,;\s]+/).filter(Boolean)) {
    if (!/^\d+$/.test(p)) {
      return { ok: false, error: `"${p}" não é válido. Use números de 1 a ${max} (ex.: 7 ou 7,12).` };
    }
    const n = Number(p);
    if (n < 1 || n > max) {
      return { ok: false, error: `Série ${n} inválida: use um número entre 1 e ${max}.` };
    }
    nums.push(n);
  }
  return { ok: true, numeros: [...new Set(nums)].sort((a, b) => a - b) };
}
