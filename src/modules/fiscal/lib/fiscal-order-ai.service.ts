import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import {
  getAnthropicClient,
  getAnthropicModelId,
  parseAnthropicJson,
} from "@/modules/engenharia/lib/services/ai.service";
import {
  saveManualFiscalItemOverride,
  type ManualFiscalItemInput,
} from "@/modules/faturamento/lib/fiscal-order-review-service";
import {
  applyFiscalToSalesOrderItems,
  parseUfFromAddress,
} from "@/modules/fiscal/lib/fiscal-rules-service";
import {
  FISCAL_STATUS_LABELS,
  type FiscalStatus,
} from "@/modules/fiscal/lib/fiscal-rules-types";

export type FiscalOrderAiPurpose =
  | "consumidor"
  | "revenda"
  | "industrializacao";

export type FiscalOrderAiResultStatus =
  | "rules_applied"
  | "needs_input"
  | "applied";

export type FiscalOrderAiResult = {
  status: FiscalOrderAiResultStatus;
  destinationUf: string | null;
  customerPurpose: FiscalOrderAiPurpose | null;
  productNatureOverride: string | null;
  summary: string;
  fiscalStatus: string;
  itemsProcessed: number;
  questions: string[];
};

type OrderItemRow = {
  id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  product: {
    ncm: string | null;
    name: string;
    product_nature: string | null;
  } | null;
};

type AiFiscalItemJson = {
  line_number?: number;
  cfop?: string | null;
  icms_rate?: number | null;
  ipi_rate?: number | null;
  pis_rate?: number | null;
  cofins_rate?: number | null;
  icms_st?: boolean | null;
  icms_st_rate?: number | null;
  cbs_rate?: number | null;
  ibs_rate?: number | null;
  ibs_cbs_classificacao?: string | null;
  notes?: string | null;
};

type AiFiscalOrderJson = {
  status?: "complete" | "needs_input";
  destination_uf?: string | null;
  customer_purpose?: string | null;
  product_nature?: string | null;
  summary?: string;
  questions?: string[];
  items?: AiFiscalItemJson[];
};

const PURPOSE_TO_NATURE: Record<FiscalOrderAiPurpose, string> = {
  consumidor: "consumidor",
  revenda: "revenda",
  industrializacao: "industrializacao",
};

function normalizePurpose(raw: string | null | undefined): FiscalOrderAiPurpose | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s.includes("revenda") || s.includes("resale")) return "revenda";
  if (s.includes("industrial")) return "industrializacao";
  if (s.includes("consum")) return "consumidor";
  return null;
}

function isAnthropicModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("not_found_error") ||
    msg.includes("model:") ||
    msg.includes("404")
  );
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** CFOP heurístico quando a IA não está disponível. */
function guessCfop(
  originUf: string | null,
  destUf: string | null,
  purpose: FiscalOrderAiPurpose | null
): string {
  const intra = Boolean(
    originUf && destUf && originUf.toUpperCase() === destUf.toUpperCase()
  );
  if (purpose === "industrializacao") return intra ? "5124" : "6124";
  if (purpose === "revenda") return intra ? "5102" : "6102";
  return intra ? "5101" : "6101";
}

function buildLocalFiscalProposal(
  items: OrderItemRow[],
  userDescription: string,
  knownUf: string | null,
  originUf: string | null,
  taxRegime: string | null
): AiFiscalOrderJson {
  const purpose = normalizePurpose(userDescription);
  const ufMatch = userDescription.match(/\b([A-Z]{2})\b/);
  const destination_uf =
    ufMatch?.[1] && ufMatch[1].length === 2 ? ufMatch[1] : knownUf;

  if (!purpose) {
    return {
      status: "needs_input",
      destination_uf,
      questions: [
        "Esta operação é para consumidor final, revenda ou industrialização?",
        "Confirme a UF de destino se for diferente do endereço do cliente.",
      ],
      summary:
        "Preciso saber a finalidade da operação para definir CFOP e impostos.",
    };
  }

  const isSimples =
    (taxRegime ?? "").toLowerCase().includes("simples") ||
    (taxRegime ?? "").toLowerCase().includes("sn");

  const cfop = guessCfop(originUf, destination_uf, purpose);
  const purposeLabel =
    purpose === "revenda"
      ? "revenda"
      : purpose === "industrializacao"
        ? "industrialização"
        : "consumidor final";

  return {
    status: "complete",
    destination_uf,
    customer_purpose: purpose,
    product_nature: PURPOSE_TO_NATURE[purpose],
    summary: `Fiscal sugerido (${purposeLabel}, ${isSimples ? "Simples Nacional" : taxRegime ?? "regime padrão"}): CFOP ${cfop} por item.`,
    items: items.map((it) => ({
      line_number: it.line_number,
      cfop,
      icms_rate: isSimples ? 0 : 18,
      ipi_rate: 0,
      pis_rate: isSimples ? 0 : 1.65,
      cofins_rate: isSimples ? 0 : 7.6,
      icms_st: false,
      icms_st_rate: 0,
      cbs_rate: 0,
      ibs_rate: 0,
      notes: `Sugestão local — confira com a contabilidade.`,
    })),
  };
}

async function resolveFullFiscalWithAi(
  userDescription: string,
  knownUf: string | null,
  context: {
    orderNumber: string;
    clientName: string;
    clientDocument: string | null;
    clientAddress: string | null;
    originUf: string | null;
    taxRegime: string | null;
    items: OrderItemRow[];
  }
): Promise<AiFiscalOrderJson> {
  const client = getAnthropicClient();
  const model = getAnthropicModelId();

  const itemLines = context.items
    .map((it) => {
      const ncm = it.product?.ncm ?? "—";
      const name = it.product?.name ?? it.description;
      return `Linha ${it.line_number}: ${name} | NCM ${ncm} | qtd ${it.quantity} | R$ ${it.unit_price}`;
    })
    .join("\n");

  const system = `Você é assistente fiscal brasileiro para um ERP industrial.
NÃO há regra fiscal cadastrada no sistema — você deve propor CFOP e alíquotas completas para cada item.

Devolva APENAS JSON válido neste formato:
{
  "status": "complete" | "needs_input",
  "destination_uf": "UF 2 letras ou null",
  "customer_purpose": "consumidor" | "revenda" | "industrializacao" | null,
  "product_nature": "consumidor/revenda/industrializacao ou null",
  "summary": "resumo em português do que foi assumido",
  "questions": ["pergunta 1", "pergunta 2"],
  "items": [
    {
      "line_number": 1,
      "cfop": "4 dígitos",
      "icms_rate": 0,
      "ipi_rate": 0,
      "pis_rate": 0,
      "cofins_rate": 0,
      "icms_st": false,
      "icms_st_rate": 0,
      "cbs_rate": 0,
      "ibs_rate": 0,
      "ibs_cbs_classificacao": null,
      "notes": "opcional"
    }
  ]
}

Regras:
- Se não souber se é consumidor final, revenda ou industrialização, use status "needs_input" e faça perguntas claras em português (não invente CFOP).
- Se status "complete", preencha TODOS os itens com cfop e alíquotas coerentes com origem/destino, NCM, regime tributário e finalidade.
- Simples Nacional: ICMS na saída costuma ser 0 ou conforme anexo; PIS/COFINS substituídos — use 0 se aplicável.
- Use CFOP de venda (5xxx intra / 6xxx inter) conforme o caso.
- Não invente NCM; use o NCM informado nos itens.`;

  const userPrompt = `Empresa origem UF: ${context.originUf ?? "?"}
Regime tributário empresa: ${context.taxRegime ?? "?"}
Pedido: ${context.orderNumber}
Cliente: ${context.clientName}
CNPJ/CPF: ${context.clientDocument ?? "—"}
Endereço: ${context.clientAddress ?? "—"}
UF destino identificada: ${knownUf ?? "não identificada"}

Itens do pedido:
${itemLines || "(sem itens)"}

Informação do utilizador:
${userDescription.trim() || "(ainda não informou finalidade da operação)"}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return parseAnthropicJson<AiFiscalOrderJson>(
      textBlock?.type === "text" ? textBlock.text : "{}"
    );
  } catch (err) {
    if (isAnthropicModelNotFound(err) || isAnthropicModelNotFound(String(err))) {
      console.warn("[fiscal-order-ai] Modelo IA indisponível, usando heurística local.");
      return buildLocalFiscalProposal(
        context.items,
        userDescription,
        knownUf,
        context.originUf,
        context.taxRegime
      );
    }
    throw err;
  }
}

function mapAiItemToManual(
  raw: AiFiscalItemJson,
  fallbackCfop: string
): ManualFiscalItemInput | null {
  const cfop =
    typeof raw.cfop === "string" && /^\d{4}$/.test(raw.cfop.trim())
      ? raw.cfop.trim()
      : fallbackCfop;
  if (!/^\d{4}$/.test(cfop)) return null;

  return {
    cfop,
    icms_rate: num(raw.icms_rate),
    ipi_rate: num(raw.ipi_rate),
    pis_rate: num(raw.pis_rate),
    cofins_rate: num(raw.cofins_rate),
    icms_st: Boolean(raw.icms_st),
    icms_st_rate: num(raw.icms_st_rate),
    cbs_rate: num(raw.cbs_rate),
    ibs_rate: num(raw.ibs_rate),
    ibs_cbs_classificacao:
      typeof raw.ibs_cbs_classificacao === "string"
        ? raw.ibs_cbs_classificacao.trim() || null
        : null,
  };
}

export async function assistFiscalSalesOrder(
  tenantId: string,
  salesOrderId: string,
  userDescription: string,
  appliedBy?: string | null
): Promise<FiscalOrderAiResult> {
  const admin = createSupabaseAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("sales_orders")
    .select(
      `
      id,
      order_number,
      client_name,
      client_address,
      client_document,
      fiscal_status,
      items:sales_order_items(
        id,
        line_number,
        description,
        quantity,
        unit_price,
        product_id,
        product:products(ncm, name, product_nature)
      )
    `
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderErr) throw new Error(orderErr.message);
  if (!order) throw new Error("Pedido não encontrado.");

  const { data: company } = await admin
    .from("company_settings")
    .select("address_state, tax_regime")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const items = (order.items ?? []) as OrderItemRow[];
  if (items.length === 0) {
    throw new Error("Pedido sem itens para aplicar fiscal.");
  }

  const knownUf = parseUfFromAddress(order.client_address);
  const originUf = company?.address_state ?? null;
  const taxRegime = company?.tax_regime ?? null;

  // 1) Se existir regra cadastrada, o motor fiscal resolve — IA não entra.
  const engine = await applyFiscalToSalesOrderItems(
    admin,
    tenantId,
    salesOrderId,
    appliedBy ?? null,
    {
      destinationUf: knownUf,
      productNatureOverride: normalizePurpose(userDescription)
        ? PURPOSE_TO_NATURE[normalizePurpose(userDescription)!]
        : null,
    }
  );

  if (
    engine.fiscalStatus === "rules_applied" ||
    engine.fiscalStatus === "approved"
  ) {
    const statusKey = engine.fiscalStatus as FiscalStatus;
    return {
      status: "rules_applied",
      destinationUf: knownUf,
      customerPurpose: normalizePurpose(userDescription),
      productNatureOverride: null,
      summary: `Regra fiscal cadastrada aplicada automaticamente (${FISCAL_STATUS_LABELS[statusKey]}). A IA só é usada quando não há regra no sistema — use «Reaplicar regras» para rever.`,
      fiscalStatus: engine.fiscalStatus,
      itemsProcessed: engine.itemsProcessed,
      questions: [],
    };
  }

  const itemsWithProduct = items.filter((it) => it.product_id);
  if (itemsWithProduct.length === 0) {
    throw new Error(
      "Nenhum item tem produto com NCM. Associe produtos ao pedido ou edite o fiscal manualmente."
    );
  }

  // 2) Sem regra: IA propõe CFOP + alíquotas completas (ou faz perguntas).
  const aiParsed = await resolveFullFiscalWithAi(userDescription, knownUf, {
    orderNumber: order.order_number,
    clientName: order.client_name,
    clientDocument: order.client_document,
    clientAddress: order.client_address,
    originUf,
    taxRegime,
    items: itemsWithProduct,
  });

  const destinationUf =
    typeof aiParsed.destination_uf === "string" &&
    aiParsed.destination_uf.length === 2
      ? aiParsed.destination_uf.toUpperCase()
      : knownUf;

  const customerPurpose =
    normalizePurpose(aiParsed.customer_purpose) ??
    normalizePurpose(userDescription);

  const needsInput =
    aiParsed.status === "needs_input" ||
    (!customerPurpose &&
      (!aiParsed.items || aiParsed.items.length === 0));

  const questions = Array.isArray(aiParsed.questions)
    ? aiParsed.questions.filter(
        (q): q is string => typeof q === "string" && q.trim().length > 0
      )
    : [];

  if (needsInput) {
    const defaultQuestions =
      questions.length > 0
        ? questions
        : [
            "Esta operação é para consumidor final, revenda ou industrialização?",
            "Há alguma condição especial (ST, isenção, drawback)?",
          ];
    return {
      status: "needs_input",
      destinationUf,
      customerPurpose,
      productNatureOverride: null,
      summary:
        typeof aiParsed.summary === "string" && aiParsed.summary.trim()
          ? aiParsed.summary.trim()
          : "Preciso de mais informações para definir CFOP e impostos.",
      fiscalStatus: order.fiscal_status ?? "pending",
      itemsProcessed: 0,
      questions: defaultQuestions,
    };
  }

  const purpose = customerPurpose ?? "revenda";
  const fallbackCfop = guessCfop(originUf, destinationUf, purpose);
  const aiItems = Array.isArray(aiParsed.items) ? aiParsed.items : [];

  let processed = 0;
  for (const it of itemsWithProduct) {
    const aiLine =
      aiItems.find((a) => a.line_number === it.line_number) ??
      aiItems[processed] ??
      aiItems[0];

    const manual = mapAiItemToManual(aiLine ?? { cfop: fallbackCfop }, fallbackCfop);
    if (!manual) continue;

    const result = await saveManualFiscalItemOverride(
      admin,
      tenantId,
      salesOrderId,
      it.id,
      manual,
      appliedBy ?? null
    );
    if (!result.ok) {
      throw new Error(result.reasons.join(" "));
    }
    processed += 1;
  }

  if (processed === 0) {
    throw new Error("A IA não devolveu CFOP válido para os itens.");
  }

  const statusKey = "manual_override" as FiscalStatus;
  const baseSummary =
    typeof aiParsed.summary === "string" && aiParsed.summary.trim()
      ? aiParsed.summary.trim()
      : `Fiscal definido pela IA para ${processed} item(ns).`;

  return {
    status: "applied",
    destinationUf,
    customerPurpose: purpose,
    productNatureOverride: PURPOSE_TO_NATURE[purpose],
    summary: `${baseSummary} CFOP e alíquotas gravados — confira na revisão fiscal.`,
    fiscalStatus: "manual_override",
    itemsProcessed: processed,
    questions: [],
  };
}
