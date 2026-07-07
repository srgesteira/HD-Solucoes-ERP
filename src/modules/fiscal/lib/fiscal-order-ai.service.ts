import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import {
  getAnthropicClient,
  getAnthropicModelId,
  parseAnthropicJson,
} from "@/modules/engenharia/lib/services/ai.service";
import {
  applyFiscalToSalesOrderItems,
  parseUfFromAddress,
} from "@/modules/fiscal/lib/fiscal-rules-service";

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

  const userPrompt = `Empresa (origem): UF ${company?.address_state ?? "?"}, regime ${company?.tax_regime ?? "?"}
Pedido: ${order.order_number}
Cliente: ${order.client_name}
Documento: ${order.client_document ?? "—"}
Endereço: ${order.client_address ?? "—"}
UF já identificada no endereço: ${knownUf ?? "não identificada"}

Itens:
${itemLines || "(sem itens)"}

Descrição do fiscal:
${userDescription.trim() || "(sem descrição adicional)"}`;

  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = parseAnthropicJson<AiFiscalOrderJson>(
    textBlock?.type === "text" ? textBlock.text : "{}"
  );

  const destinationUf =
    typeof parsed.destination_uf === "string" && parsed.destination_uf.length === 2
      ? parsed.destination_uf.toUpperCase()
      : knownUf;

  const customerPurpose = normalizePurpose(parsed.customer_purpose);
  const productNatureOverride =
    (typeof parsed.product_nature === "string" && parsed.product_nature.trim()) ||
    (customerPurpose ? PURPOSE_TO_NATURE[customerPurpose] : null);

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

  return {
    destinationUf,
    customerPurpose,
    productNatureOverride,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "Regras fiscais aplicadas com base no contexto do pedido.",
    fiscalStatus: applied.fiscalStatus,
    itemsProcessed: applied.itemsProcessed,
  };
}
