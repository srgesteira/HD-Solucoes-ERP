import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "ANTHROPIC_API_KEY não está definida no servidor. Na Vercel: Project → Settings → Environment Variables → adicione ANTHROPIC_API_KEY (Production) com uma chave de console.anthropic.com e faça Redeploy."
        : "ANTHROPIC_API_KEY não configurada. Adicione em .env.local."
    );
  }
  return new Anthropic({ apiKey: key });
}

export function getAnthropicModelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Extrai JSON do texto do modelo (pode vir com cercas ```json ou texto extra).
 */
export function parseAnthropicJson<T>(text: string): T {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Resposta da IA sem objeto JSON válido.");
  }
  raw = raw.slice(start, end + 1);
  return JSON.parse(raw) as T;
}

export interface NCMSuggestion {
  ncm: string;
  description: string;
  confidence: number;
  taxRegime?: {
    icms?: string;
    pis?: string;
    cofins?: string;
    ipi?: string;
  };
}

export interface StructureSuggestion {
  components: Array<{
    name: string;
    quantity: number;
    unit: string;
    isLabor?: boolean;
    estimatedHours?: number;
  }>;
  totalEstimatedCost?: number | null;
}

export interface OrderPdfExtraction {
  orderNumber?: string;
  clientName?: string;
  items: Array<{ description: string; quantity: number }>;
}

export async function suggestNCM(
  productDescription: string,
  productName: string
): Promise<NCMSuggestion> {
  const client = getAnthropicClient();
  const name = clip(productName, 500);
  const desc = clip(productDescription || name, 4000);

  const prompt =
    `És especialista em tributação brasileira e classificação fiscal NCM (Brasil).\n\n` +
    `Produto: ${name}\n` +
    `Descrição: ${desc}\n\n` +
    `Sugere o código NCM mais adequado ao contexto industrial/comercial típico. ` +
    `Nota: a classificação definitiva deve ser confirmada pela contabilidade.\n\n` +
    `Responde APENAS com um único objeto JSON (sem texto fora do JSON):\n` +
    `{\n` +
    `  "ncm": "XXXX.XX.XX",\n` +
    `  "description": "justificativa curta em pt-BR",\n` +
    `  "confidence": 0.85,\n` +
    `  "taxRegime": { "icms": "ex.: 17%", "pis": "ex.: 1,65%", "cofins": "ex.: 7,6%", "ipi": null }\n` +
    `}`;

  try {
    const message = await client.messages.create({
      model: getAnthropicModelId(),
      max_tokens: 600,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Resposta vazia do modelo.");
    }
    const parsed = parseAnthropicJson<NCMSuggestion>(block.text);
    if (!parsed.ncm || typeof parsed.confidence !== "number") {
      throw new Error("JSON da IA incompleto.");
    }
    return parsed;
  } catch (e) {
    console.error("suggestNCM:", e);
    throw new Error(
      e instanceof Error ? e.message : "Falha ao consultar IA para NCM."
    );
  }
}

export async function suggestProductStructure(
  technicalDescription: string,
  productName: string
): Promise<StructureSuggestion> {
  const client = getAnthropicClient();
  const name = clip(productName, 500);
  const tech = clip(technicalDescription, 6000);

  const prompt =
    `És engenheiro de produção (BOM — lista de materiais / roteiro simplificado).\n\n` +
    `Produto: ${name}\n` +
    `Descrição técnica:\n${tech}\n\n` +
    `Sugere componentes típicos: matérias-primas, comprados, semifabricados ` +
    `e mão de obra se fizer sentido (quantidades por 1 unidade do produto final).\n\n` +
    `Responde APENAS com um único objeto JSON (sem texto fora do JSON):\n` +
    `{\n` +
    `  "components": [\n` +
    `    { "name": "…", "quantity": 1, "unit": "PC", "isLabor": false },\n` +
    `    { "name": "Montagem / mão de obra", "quantity": 0.5, "unit": "H", "isLabor": true, "estimatedHours": 0.5 }\n` +
    `  ],\n` +
    `  "totalEstimatedCost": null\n` +
    `}`;

  try {
    const message = await client.messages.create({
      model: getAnthropicModelId(),
      max_tokens: 2048,
      temperature: 0.35,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Resposta vazia do modelo.");
    }
    const parsed = parseAnthropicJson<StructureSuggestion>(block.text);
    if (!Array.isArray(parsed.components)) {
      throw new Error("Lista de componentes inválida na resposta.");
    }
    return parsed;
  } catch (e) {
    console.error("suggestProductStructure:", e);
    throw new Error(
      e instanceof Error ? e.message : "Falha ao consultar IA para BOM."
    );
  }
}

/**
 * Extrai texto do PDF e pede à IA para estruturar pedido (OC / pedido de venda).
 * Uso futuro em importação de pedidos de produção.
 */
export async function extractOrderFromPDF(
  pdfBuffer: Buffer
): Promise<OrderPdfExtraction> {
  const client = getAnthropicClient();

  let text: string;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({
      data: new Uint8Array(pdfBuffer),
    });
    try {
      const textResult = await parser.getText();
      text = (textResult?.text ?? "").trim();
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (e) {
    console.error("pdf-parse:", e);
    throw new Error("Não foi possível ler o ficheiro PDF.");
  }

  if (!text) {
    throw new Error("PDF sem texto extraível (pode ser imagem escaneada).");
  }

  const textForModel = clip(text, 12000);

  const prompt =
    `Extrai informações de um pedido de compra / ordem de compra / nota de encomenda a partir do texto abaixo.\n\n` +
    `Texto:\n---\n${textForModel}\n---\n\n` +
    `Responde APENAS com um único objeto JSON (sem texto fora do JSON):\n` +
    `{\n` +
    `  "orderNumber": "número ou referência se existir",\n` +
    `  "clientName": "nome do cliente ou fornecedor conforme o documento",\n` +
    `  "items": [ { "description": "…", "quantity": 1 } ]\n` +
    `}\n` +
    `Se um campo não existir, usa string vazia ou lista vazia quando fizer sentido.`;

  try {
    const message = await client.messages.create({
      model: getAnthropicModelId(),
      max_tokens: 1200,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Resposta vazia do modelo.");
    }
    const parsed = parseAnthropicJson<OrderPdfExtraction>(block.text);
    if (!Array.isArray(parsed.items)) {
      parsed.items = [];
    }
    return parsed;
  } catch (e) {
    console.error("extractOrderFromPDF:", e);
    throw new Error(
      e instanceof Error ? e.message : "Falha ao interpretar PDF com IA."
    );
  }
}
