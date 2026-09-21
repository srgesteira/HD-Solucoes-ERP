import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { getFiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { digitsOnlyDoc } from "@/modules/fiscal/lib/bling/bling-nfe-payload";

type Admin = SupabaseClient<Database>;

export type NfeGroupMember = {
  id: string;
  order_number: string;
  customer_po_number: string | null;
  client_name: string;
  total: number;
  sort_order: number;
};

export type NfeInvoiceGroup = {
  id: string;
  primary_sales_order_id: string;
  nfe_id: string | null;
  members: NfeGroupMember[];
};

const MAX_GROUP_ORDERS = 20;

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function formatPedidoHdComplementarLine(input: {
  order_number: string;
  customer_po_number: string | null;
}): string {
  const po = input.customer_po_number?.trim();
  const pv = input.order_number.trim();
  return po
    ? `Pedido HD ${pv} - PC cliente ${po}`
    : `Pedido HD ${pv}`;
}

export async function loadNfeGroupForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<NfeInvoiceGroup | null> {
  const db = asUntypedAdmin(admin);
  const { data: memberRow, error: memberErr } = await db
    .from("nfe_invoice_group_members")
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .maybeSingle();
  if (memberErr) throw new Error(memberErr.message);
  const groupId =
    memberRow && typeof memberRow === "object"
      ? String((memberRow as { group_id?: string }).group_id ?? "")
      : "";
  if (!groupId) return null;
  return loadNfeGroupById(admin, tenantId, groupId);
}

export async function loadNfeGroupsForSalesOrders(
  admin: Admin,
  tenantId: string,
  salesOrderIds: string[]
): Promise<Map<string, NfeInvoiceGroup>> {
  const out = new Map<string, NfeInvoiceGroup>();
  if (!salesOrderIds.length) return out;
  const db = asUntypedAdmin(admin);
  const { data: memberRows, error } = await db
    .from("nfe_invoice_group_members")
    .select("group_id, sales_order_id")
    .eq("tenant_id", tenantId)
    .in("sales_order_id", salesOrderIds);
  if (error) throw new Error(error.message);
  const groupIds = [
    ...new Set(
      ((memberRows ?? []) as Array<{ group_id: string }>).map((r) => r.group_id)
    ),
  ];
  const groups = await Promise.all(
    groupIds.map((id) => loadNfeGroupById(admin, tenantId, id))
  );
  const byId = new Map(
    groups.filter((g): g is NfeInvoiceGroup => Boolean(g)).map((g) => [g.id, g])
  );
  for (const row of (memberRows ?? []) as Array<{
    group_id: string;
    sales_order_id: string;
  }>) {
    const g = byId.get(row.group_id);
    if (g) out.set(row.sales_order_id, g);
  }
  return out;
}

export async function loadNfeGroupById(
  admin: Admin,
  tenantId: string,
  groupId: string
): Promise<NfeInvoiceGroup | null> {
  const db = asUntypedAdmin(admin);
  const { data: groupRow, error: groupErr } = await db
    .from("nfe_invoice_groups")
    .select("id, primary_sales_order_id, nfe_id")
    .eq("id", groupId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (groupErr) throw new Error(groupErr.message);
  if (!groupRow) return null;

  const { data: members, error: memErr } = await db
    .from("nfe_invoice_group_members")
    .select("sales_order_id, sort_order")
    .eq("group_id", groupId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (memErr) throw new Error(memErr.message);

  const ids = ((members ?? []) as Array<{ sales_order_id: string }>).map(
    (m) => m.sales_order_id
  );
  if (!ids.length) return null;

  const { data: orders, error: soErr } = await admin
    .from("sales_orders")
    .select("id, order_number, customer_po_number, client_name, total")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (soErr) throw new Error(soErr.message);
  const byId = new Map(
    (orders ?? []).map((o) => [
      o.id,
      o as {
        id: string;
        order_number: string;
        customer_po_number: string | null;
        client_name: string;
        total: number;
      },
    ])
  );

  const memberList: NfeGroupMember[] = (
    (members ?? []) as Array<{ sales_order_id: string; sort_order: number }>
  )
    .map((m) => {
      const so = byId.get(m.sales_order_id);
      if (!so) return null;
      return {
        id: so.id,
        order_number: so.order_number,
        customer_po_number: so.customer_po_number,
        client_name: so.client_name,
        total: Number(so.total ?? 0),
        sort_order: Number(m.sort_order ?? 0),
      };
    })
    .filter((m): m is NfeGroupMember => Boolean(m));

  return {
    id: String((groupRow as { id: string }).id),
    primary_sales_order_id: String(
      (groupRow as { primary_sales_order_id: string }).primary_sales_order_id
    ),
    nfe_id:
      typeof (groupRow as { nfe_id?: string | null }).nfe_id === "string"
        ? (groupRow as { nfe_id: string }).nfe_id
        : null,
    members: memberList,
  };
}

type GroupCandidate = {
  id: string;
  order_number: string;
  client_document: string | null;
  client_name: string;
  billing_closure: string | null;
  billing_plan: string | null;
  invoice_document_type: string | null;
  status: string;
};

export async function createNfeInvoiceGroup(
  admin: Admin,
  tenantId: string,
  salesOrderIds: string[],
  createdBy: string | null
): Promise<{ ok: true; group: NfeInvoiceGroup } | { ok: false; message: string }> {
  const ids = [...new Set(salesOrderIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2) {
    return { ok: false, message: "Seleccione pelo menos dois pedidos." };
  }
  if (ids.length > MAX_GROUP_ORDERS) {
    return {
      ok: false,
      message: `No máximo ${MAX_GROUP_ORDERS} pedidos por nota.`,
    };
  }

  const db = asUntypedAdmin(admin);
  const { data: rows, error } = await db
    .from("sales_orders")
    .select(
      "id, order_number, client_document, client_name, billing_closure, billing_plan, invoice_document_type, status"
    )
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const orders = (rows ?? []) as GroupCandidate[];
  if (orders.length !== ids.length) {
    return { ok: false, message: "Um ou mais pedidos não foram encontrados." };
  }

  const docs = new Set(
    orders.map((o) => digitsOnlyDoc(o.client_document)).filter((d) => d.length >= 11)
  );
  if (docs.size !== 1) {
    return {
      ok: false,
      message: "Só é possível agrupar pedidos do mesmo cliente (mesmo CNPJ/CPF).",
    };
  }

  const types = new Set(
    orders.map((o) => o.invoice_document_type).filter(Boolean)
  );
  if (types.size !== 1) {
    return {
      ok: false,
      message: "Todos os pedidos precisam do mesmo tipo de nota (NF-e produto ou industrialização).",
    };
  }
  const docType = [...types][0];
  if (docType !== "nfe_product" && docType !== "nfe_industrialization") {
    return {
      ok: false,
      message: "Agrupar numa nota só vale para NF-e de produto ou industrialização.",
    };
  }

  for (const o of orders) {
    if (o.billing_closure) {
      return {
        ok: false,
        message: `O pedido ${o.order_number} já está finalizado no faturamento.`,
      };
    }
    if (o.billing_plan === "without_invoice") {
      return {
        ok: false,
        message: `O pedido ${o.order_number} está marcado como entrega sem nota.`,
      };
    }
    if (o.status === "cancelled" || o.status === "draft") {
      return {
        ok: false,
        message: `O pedido ${o.order_number} não está num estado válido para faturar.`,
      };
    }
  }

  const { data: existingMembers, error: existErr } = await db
    .from("nfe_invoice_group_members")
    .select("sales_order_id")
    .eq("tenant_id", tenantId)
    .in("sales_order_id", ids);
  if (existErr) throw new Error(existErr.message);
  if ((existingMembers ?? []).length) {
    return {
      ok: false,
      message: "Um dos pedidos já está noutro grupo de nota. Desagrupe primeiro.",
    };
  }

  const { data: blockingNfes, error: nfeErr } = await admin
    .from("nfes")
    .select("sales_order_id, status")
    .eq("tenant_id", tenantId)
    .in("sales_order_id", ids)
    .in("status", ["pending", "processing", "authorized"]);
  if (nfeErr) throw new Error(nfeErr.message);
  if (blockingNfes?.length) {
    return {
      ok: false,
      message: "Há pedido com nota em curso ou autorizada — não pode entrar no grupo.",
    };
  }

  const sorted = [...orders].sort((a, b) =>
    a.order_number.localeCompare(b.order_number, "pt-BR")
  );
  const primaryId = sorted[0].id;

  const { data: inserted, error: insErr } = await db
    .from("nfe_invoice_groups")
    .insert({
      tenant_id: tenantId,
      primary_sales_order_id: primaryId,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  const groupId = String((inserted as { id: string }).id);

  const memberRows = sorted.map((o, i) => ({
    group_id: groupId,
    sales_order_id: o.id,
    tenant_id: tenantId,
    sort_order: i + 1,
  }));
  const { error: memInsErr } = await db
    .from("nfe_invoice_group_members")
    .insert(memberRows);
  if (memInsErr) {
    await db.from("nfe_invoice_groups").delete().eq("id", groupId);
    throw new Error(memInsErr.message);
  }

  const group = await loadNfeGroupById(admin, tenantId, groupId);
  if (!group) return { ok: false, message: "Grupo criado, mas falhou a leitura." };
  return { ok: true, group };
}

export async function dissolveNfeInvoiceGroup(
  admin: Admin,
  tenantId: string,
  groupId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const group = await loadNfeGroupById(admin, tenantId, groupId);
  if (!group) return { ok: false, message: "Grupo não encontrado." };

  if (group.nfe_id) {
    const { data: nfe } = await admin
      .from("nfes")
      .select("status")
      .eq("id", group.nfe_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (nfe?.status === "authorized" || nfe?.status === "processing") {
      return {
        ok: false,
        message: "Não é possível desagrupar com a nota autorizada ou em curso.",
      };
    }
  }

  const memberIds = group.members.map((m) => m.id);
  const { data: blocking } = await admin
    .from("nfes")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .in("sales_order_id", memberIds)
    .in("status", ["processing", "authorized"]);
  if (blocking?.length) {
    return {
      ok: false,
      message: "Não é possível desagrupar com a nota autorizada ou em curso.",
    };
  }

  const db = asUntypedAdmin(admin);
  const { error: delErr } = await db
    .from("nfe_invoice_groups")
    .delete()
    .eq("id", groupId)
    .eq("tenant_id", tenantId);
  if (delErr) throw new Error(delErr.message);
  return { ok: true };
}

export async function attachNfeToGroup(
  admin: Admin,
  tenantId: string,
  groupId: string,
  nfeId: string
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("nfe_invoice_groups")
    .update({ nfe_id: nfeId, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

function prefixItemWithOrder(
  review: FiscalOrderReview
): FiscalOrderReview["items"] {
  const pv = review.order_number.trim();
  return review.items.map((it) => {
    const baseName = (it.product_name ?? it.description).trim() || "-";
    if (baseName.startsWith(`${pv} `) || baseName.startsWith(`${pv}-`)) {
      return it;
    }
    return {
      ...it,
      product_name: `${pv} - ${baseName}`,
    };
  });
}

export function mergeFiscalReviewsForGroupedNfe(
  reviews: FiscalOrderReview[]
): FiscalOrderReview {
  if (reviews.length === 0) {
    throw new Error("Nenhum pedido para montar a NF-e agrupada.");
  }
  if (reviews.length === 1) return reviews[0];
  const primary = reviews[0];
  const items = reviews.flatMap((r) => prefixItemWithOrder(r));
  return {
    ...primary,
    total: roundMoney(reviews.reduce((s, r) => s + Number(r.total ?? 0), 0)),
    subtotal: roundMoney(reviews.reduce((s, r) => s + Number(r.subtotal ?? 0), 0)),
    discount: roundMoney(reviews.reduce((s, r) => s + Number(r.discount ?? 0), 0)),
    total_icms: roundMoney(
      reviews.reduce((s, r) => s + Number(r.total_icms ?? 0), 0)
    ),
    total_ipi: roundMoney(
      reviews.reduce((s, r) => s + Number(r.total_ipi ?? 0), 0)
    ),
    total_tax_base: roundMoney(
      reviews.reduce((s, r) => s + Number(r.total_tax_base ?? 0), 0)
    ),
    freight_cost: roundMoney(
      reviews.reduce((s, r) => s + Number(r.freight_cost ?? 0), 0)
    ),
    items,
    warnings: [
      ...primary.warnings,
      `NF-e agrupada: ${reviews.map((r) => r.order_number).join(", ")}.`,
    ],
  };
}

/** Review usado no POST /nfe: um pedido ou a soma do grupo. */
export async function getFiscalReviewForBlingNfe(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<FiscalOrderReview | null> {
  const group = await loadNfeGroupForSalesOrder(admin, tenantId, salesOrderId);
  if (!group || group.members.length < 2) {
    return getFiscalOrderReview(admin, tenantId, salesOrderId);
  }
  const members = [...group.members].sort((a, b) => {
    if (a.id === group.primary_sales_order_id) return -1;
    if (b.id === group.primary_sales_order_id) return 1;
    return a.sort_order - b.sort_order;
  });
  const reviews: FiscalOrderReview[] = [];
  for (const member of members) {
    const review = await getFiscalOrderReview(admin, tenantId, member.id);
    if (!review) {
      throw new Error(`Pedido ${member.order_number} não encontrado para a nota agrupada.`);
    }
    reviews.push(review);
  }
  const merged = mergeFiscalReviewsForGroupedNfe(reviews);
  return {
    ...merged,
    nfe_group: group,
  };
}

export async function attachNfeGroupToReview(
  admin: Admin,
  tenantId: string,
  review: FiscalOrderReview
): Promise<FiscalOrderReview> {
  const group = await loadNfeGroupForSalesOrder(admin, tenantId, review.id);
  return { ...review, nfe_group: group };
}
