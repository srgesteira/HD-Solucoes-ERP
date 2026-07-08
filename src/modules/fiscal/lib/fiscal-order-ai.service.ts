import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  getAnthropicClient,
  getAnthropicModelId,
  parseAnthropicJson,
} from "@/modules/engenharia/lib/services/ai.service";
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

export type FiscalOrderAiResult = {
  destinationUf: string | null;
  customerPurpose: FiscalOrderAiPurpose | null;
  productNatureOverride: string | null;
  summary: string;
  fiscalStatus: string;
  itemsProcessed: number;
};

type AiFiscalOrderJson = {
  destination_uf?: string | null;
  customer_purpose?: string | null;
  product_nature?: string | null;
  summary?: string;
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

function buildLocalFiscalContext(
  userDescription: string,
  knownUf: string | null
): AiFiscalOrderJson {
  const purpose = normalizePurpose(userDescription);
  const ufMatch = userDescription.match(/\b([A-Z]{2})\b/);
  const destination_uf =
    ufMatch?.[1] && ufMatch[1].length === 2 ? ufMatch[1] : knownUf;

  const purposeLabel =
    purpose === "revenda"
      ? "revenda"
      : purpose === "industrializacao"
        ? "industrialização"
        : purpose === "consumidor"
          ? "consumidor final"
          : "operação padrão";

  return {
    destination_uf,
    customer_purpose: purpose,
    product_nature: purpose ? PURPOSE_TO_NATURE[purpose] : null,
    summary: purpose
      ? `Fiscal aplicado com base na descrição: cliente como ${purposeLabel}${destination_uf ? `, UF ${destination_uf}` : ""}.`
      : `Fiscal aplicado com UF de destino ${destination_uf ?? "do endereço do cliente"}.`,
  };
}

async function resolveFiscalContextWithAi(
  userDescription: string,
  knownUf: string | null,
  context: {
    orderNumber: string;
    clientName: string;
    clientDocument: string | null;
    clientAddress: string | null;
    originUf: string | null;
    taxRegime: string | null;
    itemLines: string;
  }
): Promise<AiFiscalOrderJson> {
  const client = getAnthropicClient();
  const model = getAnthropicModelId();

  const system = `Você é assistente fiscal brasileiro para um ERP industrial.
Com base no pedido e na descrição do utilizador, devolva APENAS JSON válido:
{
  "destination_uf": "UF de 2 letras do destino ou null",
  "customer_purpose": "consumidor" | "revenda" | "industrializacao" | null,
  "product_nature": "texto curto para regras fiscais (consumidor/revenda/industrializacao) ou null",
  "summary": "resumo em português do que foi assumido para faturar"
}
Use o endereço do cliente quando possível. Não invente NCM.`;

  const userPrompt = `Empresa (origem): UF ${context.originUf ?? "?"}, regime ${context.taxRegime ?? "?"}
Pedido: ${context.orderNumber}
Cliente: ${context.clientName}
Documento: ${context.clientDocument ?? "—"}
Endereço: ${context.clientAddress ?? "—"}
UF já identificada no endereço: ${knownUf ?? "não identificada"}

Itens:
${context.itemLines || "(sem itens)"}

Descrição do fiscal:
${userDescription.trim() || "(sem descrição adicional)"}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return parseAnthropicJson<AiFiscalOrderJson>(
      textBlock?.type === "text" ? textBlock.text : "{}"
    );
  } catch (err) {
    if (isAnthropicModelNotFound(err) || isAnthropicModelNotFound(String(err))) {
      console.warn("[fiscal-order-ai] Modelo IA indisponível, usando interpretação local.");
      return buildLocalFiscalContext(userDescription, knownUf);
    }
    throw err;
  }
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
        description,
        quantity,
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

  const items = (order.items ?? []) as Array<{
    description: string;
    quantity: number;
    product: { ncm: string | null; name: string; product_nature: string | null } | null;
  }>;

  const knownUf = parseUfFromAddress(order.client_address);
  const itemLines = items
    .map((it) => {
      const ncm = it.product?.ncm ?? "—";
      const name = it.product?.name ?? it.description;
      return `- ${name} (NCM ${ncm}) × ${it.quantity}`;
    })
    .join("\n");

  const parsed =
    userDescription.trim() && normalizePurpose(userDescription)
      ? buildLocalFiscalContext(userDescription, knownUf)
      : await resolveFiscalContextWithAi(userDescription, knownUf, {
          orderNumber: order.order_number,
          clientName: order.client_name,
          clientDocument: order.client_document,
          clientAddress: order.client_address,
          originUf: company?.address_state ?? null,
          taxRegime: company?.tax_regime ?? null,
          itemLines,
        });

  const destinationUf =
    typeof parsed.destination_uf === "string" && parsed.destination_uf.length === 2
      ? parsed.destination_uf.toUpperCase()
      : knownUf;

  const customerPurpose =
    normalizePurpose(parsed.customer_purpose) ??
    normalizePurpose(userDescription);
  const productNatureOverride =
    (typeof parsed.product_nature === "string" && parsed.product_nature.trim()) ||
    (customerPurpose ? PURPOSE_TO_NATURE[customerPurpose] : null);

  const hasBusinessContext = Boolean(customerPurpose || productNatureOverride);

  const applied = await applyFiscalToSalesOrderItems(
    admin,
    tenantId,
    salesOrderId,
    appliedBy ?? null,
    {
      destinationUf,
      productNatureOverride,
    }
  );

  let fiscalStatus = applied.fiscalStatus;

  // Sem produto/NCM: ainda permite marcar o pedido como conferido (ex.: entrega sem nota)
  // quando o utilizador já classificou a operação (revenda/consumidor/industrialização).
  if (applied.itemsProcessed === 0) {
    if (!hasBusinessContext) {
      throw new Error(
        "Nenhum item do pedido tem produto vinculado. Associe produtos com NCM ao pedido ou descreva a operação (revenda, consumidor ou industrialização)."
      );
    }
    fiscalStatus = "pending";
  }

  if (
    hasBusinessContext &&
    (fiscalStatus === "no_rules" ||
      fiscalStatus === "pending" ||
      fiscalStatus === "review_required")
  ) {
    const db = asUntypedAdmin(admin);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (db.from("sales_orders") as any)
      .update({ fiscal_status: "manual_override" })
      .eq("id", salesOrderId)
      .eq("tenant_id", tenantId);
    if (updErr) throw new Error(updErr.message);
    fiscalStatus = "manual_override";
  }

  const statusKey = (
    fiscalStatus in FISCAL_STATUS_LABELS ? fiscalStatus : "pending"
  ) as FiscalStatus;
  const statusLabel = FISCAL_STATUS_LABELS[statusKey];
  const baseSummary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "Contexto fiscal registado para o pedido.";

  return {
    destinationUf,
    customerPurpose,
    productNatureOverride,
    summary: `${baseSummary} Estado fiscal: ${statusLabel}.`,
    fiscalStatus,
    itemsProcessed: applied.itemsProcessed,
  };
}
