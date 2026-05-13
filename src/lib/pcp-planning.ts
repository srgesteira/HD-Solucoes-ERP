import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

/** Pedidos de venda visíveis no planeamento PCP. */
export const PCP_SALES_ORDER_STATUSES = ["confirmed", "in_production"] as const;

export type PcpLinePlanningRow = {
  sales_order_item_id: string;
  line_number: number;
  description: string;
  quantity: number;
  production_order_id: string | null;
  op_number: string | null;
  op_status: string | null;
  op_pcp_deadline: string | null;
  op_delivery_deadline: string | null;
  op_production_deadline: string | null;
  /** Maior `expected_delivery` dos PCs ligados à OP desta linha (via itens de compra). */
  max_purchase_expected: string | null;
};

export type PcpOrderPlanningRow = {
  sales_order_id: string;
  order_number: string;
  client_name: string;
  order_date: string;
  status: string;
  expected_delivery: string | null;
  pcp_deadline: string | null;
  lines: PcpLinePlanningRow[];
};

export async function fetchPcpPlanning(
  admin: Admin,
  tenantId: string
): Promise<PcpOrderPlanningRow[]> {
  const statuses = [...PCP_SALES_ORDER_STATUSES];
  const { data: orders, error } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, client_name, order_date, status, expected_delivery, pcp_deadline"
    )
    .eq("tenant_id", tenantId)
    .in("status", statuses)
    .order("expected_delivery", { ascending: true, nullsFirst: false })
    .order("order_date", { ascending: true });

  if (error) throw new Error(error.message);

  const result: PcpOrderPlanningRow[] = [];

  for (const so of orders ?? []) {
    const { data: items, error: iErr } = await admin
      .from("sales_order_items")
      .select("id, line_number, description, quantity, production_order_id")
      .eq("tenant_id", tenantId)
      .eq("sales_order_id", so.id)
      .order("line_number", { ascending: true });

    if (iErr) throw new Error(iErr.message);

    const opIds = [
      ...new Set(
        (items ?? [])
          .map((r) => r.production_order_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const opById = new Map<
      string,
      {
        order_number: string;
        status: string;
        pcp_deadline: string | null;
        delivery_deadline: string | null;
        production_deadline: string | null;
      }
    >();

    if (opIds.length) {
      const { data: prRows, error: prErr } = await admin
        .from("production_orders")
        .select(
          "id, order_number, status, pcp_deadline, delivery_deadline, production_deadline"
        )
        .eq("tenant_id", tenantId)
        .in("id", opIds);
      if (prErr) throw new Error(prErr.message);
      for (const p of prRows ?? []) {
        opById.set(p.id, {
          order_number: p.order_number,
          status: p.status,
          pcp_deadline: p.pcp_deadline != null ? String(p.pcp_deadline).slice(0, 10) : null,
          delivery_deadline:
            p.delivery_deadline != null
              ? String(p.delivery_deadline).slice(0, 10)
              : null,
          production_deadline:
            p.production_deadline != null
              ? String(p.production_deadline).slice(0, 10)
              : null,
        });
      }
    }

    const maxPurchaseByOp = new Map<string, string>();
    if (opIds.length) {
      const { data: poiRows, error: poiErr } = await admin
        .from("purchase_order_items")
        .select("production_order_id, purchase_order_id")
        .eq("tenant_id", tenantId)
        .in("production_order_id", opIds);
      if (poiErr) throw new Error(poiErr.message);

      const pcIds = [
        ...new Set(
          (poiRows ?? [])
            .map((r) => r.purchase_order_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      const expByPc = new Map<string, string | null>();
      if (pcIds.length) {
        const { data: pcRows, error: pcErr } = await admin
          .from("purchase_orders")
          .select("id, expected_delivery")
          .eq("tenant_id", tenantId)
          .in("id", pcIds);
        if (pcErr) throw new Error(pcErr.message);
        for (const pc of pcRows ?? []) {
          expByPc.set(
            pc.id,
            pc.expected_delivery != null
              ? String(pc.expected_delivery).slice(0, 10)
              : null
          );
        }
      }

      for (const row of poiRows ?? []) {
        const oid = row.production_order_id;
        if (!oid) continue;
        const exp = expByPc.get(row.purchase_order_id);
        if (!exp) continue;
        const cur = maxPurchaseByOp.get(oid);
        if (!cur || exp > cur) maxPurchaseByOp.set(oid, exp);
      }
    }

    const lines: PcpLinePlanningRow[] = (items ?? []).map((row) => {
      const oid = row.production_order_id;
      const op = oid ? opById.get(oid) : undefined;
      const maxP = oid ? maxPurchaseByOp.get(oid) ?? null : null;
      return {
        sales_order_item_id: row.id,
        line_number: row.line_number,
        description: row.description,
        quantity: row.quantity,
        production_order_id: oid,
        op_number: op?.order_number ?? null,
        op_status: op?.status ?? null,
        op_pcp_deadline: op?.pcp_deadline ?? null,
        op_delivery_deadline: op?.delivery_deadline ?? null,
        op_production_deadline: op?.production_deadline ?? null,
        max_purchase_expected: maxP,
      };
    });

    result.push({
      sales_order_id: so.id,
      order_number: so.order_number,
      client_name: so.client_name,
      order_date: so.order_date,
      status: so.status,
      expected_delivery:
        so.expected_delivery != null
          ? String(so.expected_delivery).slice(0, 10)
          : null,
      pcp_deadline:
        so.pcp_deadline != null ? String(so.pcp_deadline).slice(0, 10) : null,
      lines,
    });
  }

  return result;
}
