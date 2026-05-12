import type { Json } from "@/lib/types/database";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAnthropicClient,
  getAnthropicModelId,
  parseAnthropicJson,
} from "@/lib/services/ai.service";

export interface TaxAnalysis {
  ncm: string;
  productName: string;
  productType: string;
  taxRegime: string;
  icms: { rate: number; notes: string };
  pis: { rate: number; notes: string };
  cofins: { rate: number; notes: string };
  ipi: { rate: number; notes: string };
  totalTaxRate: number;
  recommendations: string[];
  estimatedSavings: number;
  isValid: boolean;
  warning?: string;
}

interface TaxAiJsonResult {
  icmsRate?: number;
  pisRate?: number;
  cofinsRate?: number;
  ipiRate?: number;
  observations?: string[];
  recommendations?: string[];
  suggestedType?: string;
  estimatedSavings?: number;
  warning?: string | null;
}

const FALLBACK_NCM = "84213990";

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function analyzeProductTax(
  productId: string,
  tenantId: string
): Promise<TaxAnalysis> {
  const supabase = await createServerSupabaseClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select(
      `
      *,
      prefix:product_prefixes (
        code
      )
    `
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .single();

  if (productError || !product) {
    throw new Error("Produto não encontrado");
  }

  const { data: regimeDefault } = await supabase
    .from("tax_regimes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();

  let regime = regimeDefault;
  if (!regime) {
    const { data: anyRegime } = await supabase
      .from("tax_regimes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name")
      .limit(1)
      .maybeSingle();
    regime = anyRegime;
  }

  const ncmRaw =
    typeof product.ncm === "string" && product.ncm.trim()
      ? product.ncm.trim()
      : FALLBACK_NCM;

  const { data: benefits } = await supabase
    .from("ncm_tax_benefits")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("ncm", ncmRaw);

  const rawPrefix = product.prefix as
    | { code?: string }
    | { code?: string }[]
    | null
    | undefined;
  const prefixRow = Array.isArray(rawPrefix) ? rawPrefix[0] : rawPrefix;
  const prefixCode =
    (prefixRow && typeof prefixRow.code === "string" && prefixRow.code.trim()
      ? prefixRow.code
      : null) ?? "HD1";

  const regimeName = regime?.name ?? "Lucro Presumido";
  const baseIcms = regime?.tax_icms != null ? Number(regime.tax_icms) : 18;
  const basePis = regime?.tax_pis != null ? Number(regime.tax_pis) : 0.65;
  const baseCofins =
    regime?.tax_cofins != null ? Number(regime.tax_cofins) : 3;
  const baseIpi = regime?.tax_ipi != null ? Number(regime.tax_ipi) : 0;

  const benefitsLines =
    benefits?.length ?
      benefits
        .map((b) => {
          const desc =
            typeof b.description === "string" ? b.description : "";
          const sav =
            b.savings_estimate != null ?
              String(b.savings_estimate)
            : "?";
          return `- ${desc}: economia estimada ${sav}%`;
        })
        .join("\n")
    : "Nenhum benefício cadastrado";

  const prompt =
    `Você é um especialista em tributação brasileira. Analise o seguinte produto:\n\n` +
    `Produto: ${product.name}\n` +
    `NCM: ${ncmRaw}\n` +
    `Tipo atual (prefixo): ${prefixCode} (${prefixCode === "HD1" ? "Revenda" : prefixCode === "HD2" ? "Industrialização" : "Revenda terceiros"})\n\n` +
    `Regime tributário da empresa: ${regimeName}\n` +
    `Alíquotas base:\n` +
    `- ICMS: ${baseIcms}%\n` +
    `- PIS: ${basePis}%\n` +
    `- COFINS: ${baseCofins}%\n` +
    `- IPI: ${baseIpi}%\n\n` +
    `Benefícios fiscais para NCM ${ncmRaw}:\n${benefitsLines}\n\n` +
    `Responda APENAS com um único objeto JSON (sem texto fora do JSON), com esta forma:\n` +
    `{\n` +
    `  "icmsRate": number,\n` +
    `  "pisRate": number,\n` +
    `  "cofinsRate": number,\n` +
    `  "ipiRate": number,\n` +
    `  "observations": ["observação 1", "observação 2"],\n` +
    `  "recommendations": ["recomendação 1", "recomendação 2"],\n` +
    `  "suggestedType": "HD1" | "HD2" | "HD3",\n` +
    `  "estimatedSavings": number,\n` +
    `  "warning": string | null\n` +
    `}\n\n` +
    `REGRAS IMPORTANTES:\n` +
    `- Industrialização (HD2) só é válida se a empresa compra matéria-prima e fabrica.\n` +
    `- O produto atual é ${prefixCode} — mantenha se for compatível.\n` +
    `- Se não houver certeza, recomende HD1 (Revenda), que é mais simples.`;

  const client = getAnthropicClient();
  const model = getAnthropicModelId();

  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Resposta vazia do modelo.");
  }

  const result = parseAnthropicJson<TaxAiJsonResult>(block.text);

  const icmsRate = num(result.icmsRate, baseIcms);
  const pisRate = num(result.pisRate, basePis);
  const cofinsRate = num(result.cofinsRate, baseCofins);
  const ipiRate = num(result.ipiRate, baseIpi);
  const observations = Array.isArray(result.observations) ?
      result.observations.filter((o) => typeof o === "string")
    : [];

  const pickNote = (kw: string) =>
    observations.find((o) => o.toLowerCase().includes(kw.toLowerCase())) ??
    "";

  const { error: histError } = await supabase
    .from("tax_analysis_history")
    .insert({
      tenant_id: tenantId,
      product_id: productId,
      ncm: typeof product.ncm === "string" ? product.ncm : null,
      tax_regime_id: regime?.id ?? null,
      analysis: result as unknown as Json,
      recommendation:
        typeof result.suggestedType === "string" ?
          result.suggestedType
        : null,
    });

  if (histError) {
    console.error("[tax-ai] tax_analysis_history insert:", histError);
  }

  return {
    ncm: ncmRaw,
    productName: product.name,
    productType: prefixCode,
    taxRegime: regimeName,
    icms: { rate: icmsRate, notes: pickNote("icms") },
    pis: { rate: pisRate, notes: pickNote("pis") },
    cofins: { rate: cofinsRate, notes: pickNote("cofins") },
    ipi: { rate: ipiRate, notes: pickNote("ipi") },
    totalTaxRate: icmsRate + pisRate + cofinsRate + ipiRate,
    recommendations: Array.isArray(result.recommendations) ?
        result.recommendations.filter((r) => typeof r === "string")
      : [],
    estimatedSavings: num(result.estimatedSavings, 0),
    isValid: true,
    warning:
      result.warning === null || result.warning === undefined ?
        undefined
      : String(result.warning),
  };
}
