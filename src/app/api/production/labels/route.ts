import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  detectarTemplatePadrao,
  parseLabelTemplate,
  type LabelTemplate,
} from "@/modules/producao/lib/etiquetas/label-template";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = any;

async function guard() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: apiError("Não autenticado", 401) };
  const denied = await requireMenuModule("producao");
  if (denied) return { error: denied };
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: apiError("Tenant não encontrado", 403) };
  return { tenantId };
}

/**
 * GET /api/production/labels?order_item_id=...
 * Tudo que a etiqueta precisa: item, produto, modelo salvo (ou detectado), pedido, empresa.
 */
export async function GET(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { tenantId } = g;
  const orderItemId = request.nextUrl.searchParams.get("order_item_id");
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const admin = createSupabaseAdminClient() as Loose;

  const { data: item, error: itemErr } = await admin
    .from("order_items")
    .select("id, description, quantity, product_id, order_id, sales_order_item_id")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (itemErr) return apiError(itemErr.message, 500);
  if (!item) return apiError("Item de produção não encontrado", 404);

  const [{ data: op }, { data: soi }, { data: company }] = await Promise.all([
    admin
      .from("production_orders")
      .select("order_number, client_name")
      .eq("id", item.order_id)
      .maybeSingle(),
    item.sales_order_item_id
      ? admin
          .from("sales_order_items")
          .select("sales_order_id")
          .eq("id", item.sales_order_item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("company_settings")
      .select("trade_name, company_name, logo_url, website")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  let so: Loose = null;
  if (soi?.sales_order_id) {
    const r = await admin
      .from("sales_orders")
      .select("order_number, customer_po_number, client_name")
      .eq("id", soi.sales_order_id)
      .maybeSingle();
    so = r.data;
  }

  let product: Loose = null;
  let templateSaved: LabelTemplate | null = null;
  let templateColumnReady = true;
  if (item.product_id) {
    const { data: p } = await admin
      .from("products")
      .select("id, name, technical_code, code, description")
      .eq("id", item.product_id)
      .maybeSingle();
    product = p;
    const t = await admin
      .from("products")
      .select("label_template")
      .eq("id", item.product_id)
      .maybeSingle();
    if (t.error) {
      // Coluna ainda não criada (migration pendente) → segue com detecção automática.
      templateColumnReady = false;
    } else {
      templateSaved = parseLabelTemplate(t.data?.label_template);
    }
  }

  const descricao = (item.description || product?.name || "").trim();
  const codigo = (product?.technical_code || product?.code || "").trim();

  return apiOk({
    order_item_id: item.id,
    product_id: item.product_id,
    codigo: codigo || "—",
    descricao,
    quantidade: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    pedido: so?.order_number ?? op?.order_number ?? "",
    op: op?.order_number ?? null,
    pedido_cliente: so?.customer_po_number ?? null,
    cliente: so?.client_name ?? op?.client_name ?? null,
    template: templateSaved ?? detectarTemplatePadrao(descricao, codigo),
    template_saved: Boolean(templateSaved),
    template_column_ready: templateColumnReady,
    empresa: {
      nome: (company?.trade_name || company?.company_name || "HD Industrial").trim(),
      logo_url: company?.logo_url ?? null,
      site: (company?.website || "www.hdindustrial.ind.br").trim(),
    },
  });
}

/** PUT /api/production/labels  { order_item_id, template } → salva o modelo no produto. */
export async function PUT(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { tenantId } = g;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }
  const orderItemId = typeof body.order_item_id === "string" ? body.order_item_id : null;
  const template = parseLabelTemplate(body.template);
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);
  if (!template) return apiError("Modelo de etiqueta inválido", 400);

  const admin = createSupabaseAdminClient() as Loose;
  const { data: item } = await admin
    .from("order_items")
    .select("product_id")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!item) return apiError("Item de produção não encontrado", 404);
  if (!item.product_id) {
    return apiError("Item sem produto cadastrado — o modelo não pode ser salvo (imprime normalmente).", 400);
  }

  const { error } = await admin
    .from("products")
    .update({ label_template: template })
    .eq("id", item.product_id)
    .eq("tenant_id", tenantId);
  if (error) {
    const missing = /label_template/.test(error.message);
    return apiError(
      missing
        ? "Falta aplicar a atualização do banco (coluna label_template). A etiqueta imprime, só não fica salva."
        : error.message,
      missing ? 409 : 500
    );
  }
  return apiOk({ saved: true, template });
}
