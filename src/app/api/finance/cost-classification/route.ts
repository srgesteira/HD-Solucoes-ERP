import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

/**
 * Centros de custo × naturezas (malha HD, nov/2026).
 *
 * GET  ?view=pending (padrão) → itens de PC sem centro ou natureza (desde ?since=, padrão 2026-11-01)
 * GET  ?view=catalog          → códigos de centros e naturezas (lista curta)
 * POST { item_id, center, nature, remember? }
 *      center/nature = códigos ("2.02", "FER"); remember = "supplier" | "product" grava regra,
 *      e o gatilho do banco passa a classificar sozinho as próximas compras iguais.
 *
 * Saída compacta de propósito: é consumida pelo agente (menos tokens) e pela tela.
 */

type Admin = ReturnType<typeof asUntypedAdmin>;

async function loadCatalog(admin: Admin, tenantId: string) {
  const [cc, cn] = await Promise.all([
    admin
      .from("cost_centers")
      .select("id, code, name, kind")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .neq("kind", "group")
      .order("sort_order"),
    admin
      .from("cost_natures")
      .select("id, code, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (cc.error) throw cc.error;
  if (cn.error) throw cn.error;
  return {
    centers: (cc.data ?? []) as { id: string; code: string; name: string; kind: string }[],
    natures: (cn.data ?? []) as { id: string; code: string; name: string }[],
  };
}

export async function GET(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const view = request.nextUrl.searchParams.get("view") ?? "pending";

  try {
    const catalog = await loadCatalog(admin, tenantId);

    if (view === "catalog") {
      return apiOk({
        centers: catalog.centers.map((c) => `${c.code} ${c.name}`),
        natures: catalog.natures.map((n) => `${n.code} ${n.name}`),
      });
    }

    const since = request.nextUrl.searchParams.get("since") ?? "2026-11-01";
    const { data, error } = await admin
      .from("purchase_order_items")
      .select(
        "id, description, total_price, cost_center_id, cost_nature_id, purchase_orders!inner(po_number, order_date, status, suppliers(name))"
      )
      .eq("tenant_id", tenantId)
      .gte("purchase_orders.order_date", since)
      .neq("purchase_orders.status", "cancelled")
      .or("cost_center_id.is.null,cost_nature_id.is.null")
      .limit(200);
    if (error) {
      return apiError("Erro ao listar pendências: " + error.message, supabaseErrorToHttp(error.code));
    }

    const centerCode = new Map(catalog.centers.map((c) => [c.id, c.code]));
    const natureCode = new Map(catalog.natures.map((n) => [n.id, n.code]));
    type Row = {
      id: string;
      description: string | null;
      total_price: number | null;
      cost_center_id: string | null;
      cost_nature_id: string | null;
      purchase_orders: { po_number: string; suppliers: { name: string } | null } | null;
    };
    const pending = ((data ?? []) as unknown as Row[]).map((r) => ({
      item_id: r.id,
      pc: r.purchase_orders?.po_number ?? null,
      fornecedor: r.purchase_orders?.suppliers?.name ?? null,
      item: r.description,
      valor: r.total_price,
      centro: r.cost_center_id ? centerCode.get(r.cost_center_id) ?? null : null,
      natureza: r.cost_nature_id ? natureCode.get(r.cost_nature_id) ?? null : null,
    }));
    return apiOk({ since, count: pending.length, pending });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError("Erro: " + msg, 500);
  }
}

export async function POST(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }
  const itemId = typeof b.item_id === "string" ? b.item_id : "";
  const centerCodeIn = typeof b.center === "string" ? b.center.trim() : "";
  const natureCodeIn = typeof b.nature === "string" ? b.nature.trim().toUpperCase() : "";
  const remember = b.remember === "supplier" || b.remember === "product" ? b.remember : null;
  if (!itemId) return apiError("item_id é obrigatório", 400);
  if (!centerCodeIn && !natureCodeIn) return apiError("Informe center e/ou nature", 400);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  try {
    const catalog = await loadCatalog(admin, tenantId);
    const center = centerCodeIn ? catalog.centers.find((c) => c.code === centerCodeIn) : undefined;
    const nature = natureCodeIn ? catalog.natures.find((n) => n.code === natureCodeIn) : undefined;
    if (centerCodeIn && !center) return apiError(`Centro ${centerCodeIn} não existe`, 400);
    if (natureCodeIn && !nature) return apiError(`Natureza ${natureCodeIn} não existe`, 400);

    const { data: item, error: itemErr } = await admin
      .from("purchase_order_items")
      .select("id, product_id, cost_center_id, cost_nature_id, purchase_orders!inner(supplier_id)")
      .eq("tenant_id", tenantId)
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr) return apiError(itemErr.message, supabaseErrorToHttp(itemErr.code));
    if (!item) return apiError("Item não encontrado", 404);
    const it = item as unknown as {
      product_id: string | null;
      cost_center_id: string | null;
      cost_nature_id: string | null;
      purchase_orders: { supplier_id: string | null };
    };

    const newCenter = center?.id ?? it.cost_center_id;
    const newNature = nature?.id ?? it.cost_nature_id;
    const { error: upErr } = await admin
      .from("purchase_order_items")
      .update({ cost_center_id: newCenter, cost_nature_id: newNature, cost_classified_by: "manual" })
      .eq("id", itemId)
      .eq("tenant_id", tenantId);
    if (upErr) return apiError(upErr.message, supabaseErrorToHttp(upErr.code));

    let rule: string | null = null;
    if (remember) {
      const matchCol = remember === "supplier" ? "supplier_id" : "product_id";
      const matchVal = remember === "supplier" ? it.purchase_orders.supplier_id : it.product_id;
      if (matchVal) {
        await admin
          .from("cost_classification_rules")
          .delete()
          .eq("tenant_id", tenantId)
          .eq(matchCol, matchVal);
        const { error: rErr } = await admin.from("cost_classification_rules").insert({
          tenant_id: tenantId,
          [matchCol]: matchVal,
          cost_center_id: center?.id ?? null,
          cost_nature_id: nature?.id ?? null,
          priority: 40,
          notes: "Aprendida na classificação manual",
        });
        if (rErr) return apiError("Item salvo, mas a regra falhou: " + rErr.message, 500);
        rule = remember;
      }
    }

    return apiOk({ ok: true, item_id: itemId, center: center?.code ?? null, nature: nature?.code ?? null, rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError("Erro: " + msg, 500);
  }
}
