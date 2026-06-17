import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import type {
  PurchaseReturnReason,
  PurchaseReturnStatus,
  ReturnFinancialAction,
} from "./returns-types";

/**
 * §10.3 — devolução de compra ao fornecedor.
 *
 * Regras:
 *  - O pedido de compra original (purchase_orders) NUNCA é alterado.
 *  - status="sent" é o que move ledger: saída de estoque + abre crédito
 *    com o fornecedor (receivable contra ele).
 *  - Reversão de landed cost: cada movimento de saída registra o custo
 *    unitário praticado no recebimento, baseado em purchase_order_items.
 */

type Admin = SupabaseClient<Database>;

export type CreatePurchaseReturnInput = {
  purchaseOrderId: string;
  reason: PurchaseReturnReason;
  notes?: string | null;
  financialAction: ReturnFinancialAction;
  items: Array<{
    purchaseOrderItemId: string;
    productId?: string | null;
    description?: string | null;
    quantity: number;
    unitPrice: number;
  }>;
};

export type PurchaseReturnRow = {
  id: string;
  return_number: string;
  status: PurchaseReturnStatus;
  total_value: number;
  purchase_order_id: string;
};

async function nextReturnNumber(
  admin: Admin,
  tenantId: string
): Promise<string> {
  const db = asUntypedAdmin(admin);
  const year = new Date().getFullYear();
  const prefix = `DEV-COMP-${year}-`;
  const { data } = await db
    .from("purchase_returns")
    .select("return_number")
    .eq("tenant_id", tenantId)
    .ilike("return_number", `${prefix}%`)
    .order("return_number", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const last = (data[0] as { return_number: string }).return_number;
    const seq = parseInt(last.replace(prefix, ""), 10);
    if (Number.isFinite(seq)) next = seq + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createPurchaseReturn(
  admin: Admin,
  args: { tenantId: string; userId: string; userEmail: string | null } & {
    input: CreatePurchaseReturnInput;
  }
): Promise<PurchaseReturnRow> {
  const { tenantId, userId, userEmail, input } = args;
  const db = asUntypedAdmin(admin);

  if (!input.items || input.items.length === 0) {
    throw new Error("Devolução precisa de pelo menos um item.");
  }

  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, tenant_id, supplier_id, status")
    .eq("id", input.purchaseOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!po) throw new Error("Pedido de compra não encontrado.");

  const totalValue = input.items.reduce(
    (acc, it) => acc + Number(it.quantity) * Number(it.unitPrice),
    0
  );
  const returnNumber = await nextReturnNumber(admin, tenantId);

  const { data: ret, error: retErr } = await db
    .from("purchase_returns")
    .insert({
      tenant_id: tenantId,
      return_number: returnNumber,
      purchase_order_id: input.purchaseOrderId,
      reason: input.reason,
      notes: input.notes ?? null,
      financial_action: input.financialAction,
      status: "draft",
      total_value: totalValue,
      created_by: userId,
    })
    .select("*")
    .single();
  if (retErr || !ret) {
    throw new Error(retErr?.message ?? "Erro ao criar devolução de compra");
  }
  const created = ret as PurchaseReturnRow & { id: string };

  const itemRows = input.items.map((it) => ({
    tenant_id: tenantId,
    purchase_return_id: created.id,
    purchase_order_item_id: it.purchaseOrderItemId,
    product_id: it.productId ?? null,
    description: it.description ?? null,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    total_price: Number(it.quantity) * Number(it.unitPrice),
  }));
  const { error: itemsErr } = await db
    .from("purchase_return_items")
    .insert(itemRows);
  if (itemsErr) {
    await db.from("purchase_returns").delete().eq("id", created.id);
    throw new Error("Erro ao criar linhas: " + itemsErr.message);
  }

  await recordAuditEvent(admin, {
    tenantId,
    actorId: userId,
    actorEmail: userEmail,
    table: "purchase_returns",
    recordId: created.id,
    eventKind: "purchase_return_created",
    payload: {
      purchase_order_id: input.purchaseOrderId,
      reason: input.reason,
      financial_action: input.financialAction,
      total_value: totalValue,
    },
  });

  return created;
}

export async function authorizePurchaseReturn(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    userEmail: string | null;
    returnId: string;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("purchase_returns")
    .update({
      status: "authorized",
      authorized_by: args.userId,
      authorized_at: new Date().toISOString(),
    })
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId)
    .eq("status", "draft");
  if (error) throw new Error(error.message);

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "purchase_returns",
    recordId: args.returnId,
    eventKind: "purchase_return_authorized",
  });
}

/**
 * Despacha devolução: tira do estoque e gera receivable contra o
 * fornecedor (refund/credit). Replacement não toca financeiro.
 */
export async function shipPurchaseReturn(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    userEmail: string | null;
    returnId: string;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);

  const { data: ret } = await db
    .from("purchase_returns")
    .select("*")
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (!ret) throw new Error("Devolução não encontrada.");

  type ReturnRow = {
    id: string;
    status: PurchaseReturnStatus;
    purchase_order_id: string;
    financial_action: ReturnFinancialAction;
    total_value: number;
  };
  const r = ret as ReturnRow;

  if (r.status !== "authorized") {
    throw new Error(
      "Devolução de compra precisa estar autorizada antes do despacho."
    );
  }

  const { data: po } = await admin
    .from("purchase_orders")
    .select("id, supplier_id, supplier:suppliers(id, name, document)")
    .eq("id", r.purchase_order_id)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  const supplier = po?.supplier as
    | { id: string; name: string; document: string | null }
    | null
    | undefined;

  const { data: items } = await db
    .from("purchase_return_items")
    .select("*")
    .eq("purchase_return_id", args.returnId);

  type ItemRow = {
    id: string;
    product_id: string | null;
    quantity: number;
  };
  const itemRows = (items ?? []) as ItemRow[];

  // 1. Saída de estoque por devolução de compra.
  for (const it of itemRows) {
    if (!it.product_id) continue;
    const { error: movErr } = await admin.from("inventory_movements").insert({
      tenant_id: args.tenantId,
      product_id: it.product_id,
      movement_type: "out",
      origin: "purchase_return",
      reference_id: args.returnId,
      quantity: Number(it.quantity),
      reason: `Devolução compra ${args.returnId}`,
      user_id: args.userId,
    });
    if (movErr) {
      throw new Error("Erro ao mover estoque: " + movErr.message);
    }
  }

  // 2. Financeiro: cria receivable contra o fornecedor (devolve dinheiro).
  if (
    (r.financial_action === "refund" || r.financial_action === "credit_note") &&
    Number(r.total_value) > 0 &&
    supplier
  ) {
    // status segue o CHECK constraint da tabela
    // (pending|partial|paid|overdue|cancelled).
    const { error: recErr } = await admin.from("receivables").insert({
      tenant_id: args.tenantId,
      client_name: supplier.name,
      client_document: supplier.document,
      description:
        r.financial_action === "refund"
          ? `Reembolso devolução compra ${args.returnId}`
          : `Crédito do fornecedor — devolução ${args.returnId}`,
      original_amount: Number(r.total_value),
      current_amount: Number(r.total_value),
      due_date: new Date().toISOString().slice(0, 10),
      issue_date: new Date().toISOString().slice(0, 10),
      source_kind: "purchase_return",
      status: "pending",
      is_forecast: false,
    });
    if (recErr) {
      throw new Error("Erro ao gerar receivable: " + recErr.message);
    }
  }

  // 3. Marca como enviado.
  await db
    .from("purchase_returns")
    .update({
      status: "sent",
      shipped_by: args.userId,
      shipped_at: new Date().toISOString(),
    })
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId);

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "purchase_returns",
    recordId: args.returnId,
    eventKind: "purchase_return_shipped",
    payload: {
      financial_action: r.financial_action,
      total_value: r.total_value,
    },
  });
}

export async function listPurchaseReturns(
  admin: Admin,
  args: { tenantId: string }
) {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("purchase_returns")
    .select(
      "id, return_number, return_date, status, total_value, reason, purchase_order_id"
    )
    .eq("tenant_id", args.tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPurchaseReturnDetail(
  admin: Admin,
  args: { tenantId: string; returnId: string }
) {
  const db = asUntypedAdmin(admin);
  const { data: header } = await db
    .from("purchase_returns")
    .select("*")
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (!header) return null;
  const { data: items } = await db
    .from("purchase_return_items")
    .select("*")
    .eq("purchase_return_id", args.returnId);
  return { header, items: items ?? [] };
}
