import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { applyInventoryOutbound } from "@/modules/almoxarifado/lib/inventory-outbound";
import { INVENTORY_ORIGIN } from "@/modules/almoxarifado/lib/inventory-origins";

type Admin = SupabaseClient<Database>;

export type ManualInventoryOutResult = {
  order_number: string | null;
  production_order_id: string | null;
  quantity: number;
};

/**
 * Saída manual de estoque. Se informar OP, a origem no extrato aponta para a OP
 * (caso típico: item excluído no abastecimento e baixado depois).
 */
export async function applyManualInventoryOutbound(
  admin: Admin,
  tenantId: string,
  args: {
    productId: string;
    quantity: number;
    reason?: string | null;
    productionOrderId?: string | null;
    userId?: string | null;
  }
): Promise<ManualInventoryOutResult> {
  const quantity = Number(args.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantidade inválida para saída.");
  }

  const { data: product, error: pErr } = await admin
    .from("products")
    .select("id, technical_code, name")
    .eq("id", args.productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!product) throw new Error("Produto não encontrado.");

  let orderNumber: string | null = null;
  let productionOrderId: string | null = null;
  let referenceId: string | null = null;

  if (args.productionOrderId) {
    const { data: po, error: poErr } = await admin
      .from("production_orders")
      .select("id, order_number, status, is_suggestion")
      .eq("id", args.productionOrderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (poErr) throw new Error(poErr.message);
    if (!po) throw new Error("Ordem de produção não encontrada.");
    if (po.is_suggestion) {
      throw new Error("Não é possível vincular a uma sugestão do MRP.");
    }
    if (po.status === "cancelled") {
      throw new Error("Ordem de produção cancelada.");
    }

    productionOrderId = po.id;
    orderNumber = po.order_number;
    // Preferir um item da OP como referência (mesmo padrão do abastecimento)
    const { data: oi } = await admin
      .from("order_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("order_id", po.id)
      .eq("is_suggestion", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    referenceId = oi?.id ?? po.id;
  }

  const reason =
    args.reason?.trim() ||
    (orderNumber
      ? `Saída manual — OP ${orderNumber}`
      : "Saída manual de estoque");

  const out = await applyInventoryOutbound(
    admin,
    tenantId,
    args.productId,
    quantity,
    {
      reason,
      referenceId,
      origin: INVENTORY_ORIGIN.MANUAL_OUT,
      userId: args.userId ?? null,
      allowNegative: true,
    }
  );
  if (out.error) throw new Error(out.error);

  return {
    order_number: orderNumber,
    production_order_id: productionOrderId,
    quantity,
  };
}

export async function searchProductionOrdersForManualOut(
  admin: Admin,
  tenantId: string,
  search: string
): Promise<
  Array<{
    id: string;
    order_number: string;
    status: string;
    product_hint: string | null;
  }>
> {
  const q = search.trim();
  if (q.length < 2) return [];

  const escaped = q
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

  const { data, error } = await admin
    .from("production_orders")
    .select("id, order_number, status")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .neq("status", "cancelled")
    .ilike("order_number", `%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: items } = await admin
    .from("order_items")
    .select(
      "order_id, product:products!order_items_product_id_fkey(technical_code, name)"
    )
    .eq("tenant_id", tenantId)
    .in("order_id", ids)
    .eq("is_suggestion", false)
    .limit(40);

  const hintByOrder = new Map<string, string>();
  for (const it of items ?? []) {
    if (hintByOrder.has(it.order_id)) continue;
    const prod = Array.isArray(it.product) ? it.product[0] : it.product;
    if (!prod) continue;
    const code =
      prod && typeof prod === "object" && "technical_code" in prod
        ? (prod as { technical_code?: string | null }).technical_code
        : null;
    const name =
      prod && typeof prod === "object" && "name" in prod
        ? (prod as { name?: string | null }).name
        : null;
    hintByOrder.set(
      it.order_id,
      [code, name].filter(Boolean).join(" — ") || null!
    );
  }

  return rows.map((r) => ({
    id: r.id,
    order_number: r.order_number,
    status: r.status,
    product_hint: hintByOrder.get(r.id) ?? null,
  }));
}
