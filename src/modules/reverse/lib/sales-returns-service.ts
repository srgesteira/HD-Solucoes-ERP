import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import type {
  ReturnFinancialAction,
  SalesReturnItemCondition,
  SalesReturnReason,
  SalesReturnStatus,
} from "./returns-types";

/**
 * §10.1 — devolução de venda.
 *
 * Regras:
 *   1. Documento original (sales_order) NUNCA é alterado. Devolução vive
 *      em sales_returns com vínculo (sales_order_id).
 *   2. Apenas devolução com status="received" mexe estoque e financeiro.
 *      Draft e authorized não tocam em ledger.
 *   3. Cada linha: gera inventory_movement com origin="sales_return".
 *      Se condition='scrap', não retorna ao estoque vendável.
 *   4. financial_action='refund' → cria payable contra o cliente
 *      (cliente quer dinheiro de volta).
 *   5. financial_action='credit_note' → registra evento de crédito;
 *      a aplicação fica para o próximo pedido (saldo a usar).
 *   6. financial_action='replacement' → não toca financeiro.
 *   7. Tudo registado na audit_log com event_kind explícito.
 */

type Admin = SupabaseClient<Database>;

export type CreateSalesReturnInput = {
  salesOrderId: string;
  reason: SalesReturnReason;
  notes?: string | null;
  financialAction: ReturnFinancialAction;
  restockLocation?: string | null;
  items: Array<{
    salesOrderItemId: string;
    quantity: number;
    unitPrice: number;
    condition: SalesReturnItemCondition;
    description?: string | null;
    productId?: string | null;
  }>;
};

export type SalesReturnRow = {
  id: string;
  return_number: string;
  status: SalesReturnStatus;
  total_value: number;
  sales_order_id: string;
};

async function nextReturnNumber(
  admin: Admin,
  tenantId: string
): Promise<string> {
  const db = asUntypedAdmin(admin);
  const year = new Date().getFullYear();
  const prefix = `DEV-${year}-`;
  const { data } = await db
    .from("sales_returns")
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

export async function createSalesReturn(
  admin: Admin,
  args: { tenantId: string; userId: string; userEmail: string | null } & {
    input: CreateSalesReturnInput;
  }
): Promise<SalesReturnRow> {
  const { tenantId, userId, userEmail, input } = args;
  const db = asUntypedAdmin(admin);

  if (!input.items || input.items.length === 0) {
    throw new Error("Devolução precisa de pelo menos um item.");
  }

  const { data: order, error: orderErr } = await admin
    .from("sales_orders")
    .select("id, status, tenant_id")
    .eq("id", input.salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) throw new Error("Pedido de venda não encontrado.");

  const totalValue = input.items.reduce(
    (acc, it) => acc + Number(it.quantity) * Number(it.unitPrice),
    0
  );
  const returnNumber = await nextReturnNumber(admin, tenantId);

  const { data: ret, error: retErr } = await db
    .from("sales_returns")
    .insert({
      tenant_id: tenantId,
      return_number: returnNumber,
      sales_order_id: input.salesOrderId,
      reason: input.reason,
      notes: input.notes ?? null,
      financial_action: input.financialAction,
      restock_location: input.restockLocation ?? null,
      status: "draft",
      total_value: totalValue,
      created_by: userId,
    })
    .select("*")
    .single();
  if (retErr || !ret) {
    throw new Error(retErr?.message ?? "Erro ao criar devolução");
  }
  const created = ret as SalesReturnRow & { id: string };

  const itemRows = input.items.map((it) => ({
    tenant_id: tenantId,
    sales_return_id: created.id,
    sales_order_item_id: it.salesOrderItemId,
    product_id: it.productId ?? null,
    description: it.description ?? null,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    total_price: Number(it.quantity) * Number(it.unitPrice),
    condition: it.condition,
  }));

  const { error: itemsErr } = await db
    .from("sales_return_items")
    .insert(itemRows);
  if (itemsErr) {
    await db.from("sales_returns").delete().eq("id", created.id);
    throw new Error("Erro ao criar linhas: " + itemsErr.message);
  }

  await recordAuditEvent(admin, {
    tenantId,
    actorId: userId,
    actorEmail: userEmail,
    table: "sales_returns",
    recordId: created.id,
    eventKind: "sales_return_created",
    payload: {
      sales_order_id: input.salesOrderId,
      reason: input.reason,
      financial_action: input.financialAction,
      total_value: totalValue,
    },
  });

  return created;
}

export async function authorizeSalesReturn(
  admin: Admin,
  args: { tenantId: string; userId: string; userEmail: string | null; returnId: string }
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("sales_returns")
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
    table: "sales_returns",
    recordId: args.returnId,
    eventKind: "sales_return_authorized",
  });
}

/**
 * Recebe a mercadoria devolvida fisicamente. Aqui é que mexe estoque
 * e financeiro. É a única transição irreversível pelo app — uma vez
 * "received", a contra-devolução só pelo cancelamento + nova operação.
 */
export async function receiveSalesReturn(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    userEmail: string | null;
    returnId: string;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);

  const { data: ret, error: retErr } = await db
    .from("sales_returns")
    .select("*")
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (retErr) throw new Error(retErr.message);
  if (!ret) throw new Error("Devolução não encontrada.");

  type ReturnRow = {
    id: string;
    status: SalesReturnStatus;
    sales_order_id: string;
    financial_action: ReturnFinancialAction;
    total_value: number;
  };
  const r = ret as ReturnRow;

  if (r.status !== "authorized") {
    throw new Error("Devolução precisa estar autorizada antes de receber.");
  }

  const { data: items, error: itemsErr } = await db
    .from("sales_return_items")
    .select("*")
    .eq("sales_return_id", args.returnId);
  if (itemsErr) throw new Error(itemsErr.message);

  type ItemRow = {
    id: string;
    product_id: string | null;
    quantity: number;
    condition: SalesReturnItemCondition;
  };
  const itemRows = (items ?? []) as ItemRow[];

  // 1. Movimentos de estoque (entrada por devolução; ignora 'scrap').
  for (const it of itemRows) {
    if (!it.product_id) continue;
    if (it.condition === "scrap") continue;
    const { error: movErr } = await admin.from("inventory_movements").insert({
      tenant_id: args.tenantId,
      product_id: it.product_id,
      movement_type: "in",
      origin: "sales_return",
      reference_id: args.returnId,
      quantity: Number(it.quantity),
      reason: `Devolução ${r.id} (cond ${it.condition})`,
      user_id: args.userId,
    });
    if (movErr) {
      throw new Error("Erro ao mover estoque: " + movErr.message);
    }
  }

  // 2. Impacto financeiro.
  if (r.financial_action === "refund" && Number(r.total_value) > 0) {
    // Pagar de volta ao cliente — accounts_payable contra "Cliente: devolução".
    // Sem supplier_id (é cliente, não fornecedor), só categoria + descrição.
    // status segue o CHECK constraint da tabela (pending|paid|overdue|cancelled).
    const { error: payErr } = await admin.from("accounts_payable").insert({
      tenant_id: args.tenantId,
      category: "sales_return_refund",
      description: `Reembolso devolução ${args.returnId}`,
      original_amount: Number(r.total_value),
      current_amount: Number(r.total_value),
      due_date: new Date().toISOString().slice(0, 10),
      source_kind: "sales_return",
      status: "pending",
      is_forecast: false,
    });
    if (payErr) {
      throw new Error("Erro ao gerar payable: " + payErr.message);
    }
  }

  // 3. Atualiza status da devolução.
  await db
    .from("sales_returns")
    .update({
      status: "received",
      received_by: args.userId,
      received_at: new Date().toISOString(),
    })
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId);

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "sales_returns",
    recordId: args.returnId,
    eventKind: "sales_return_received",
    payload: {
      financial_action: r.financial_action,
      total_value: r.total_value,
    },
  });
}

export async function listSalesReturns(
  admin: Admin,
  args: { tenantId: string; status?: SalesReturnStatus | null }
) {
  const db = asUntypedAdmin(admin);
  let q = db
    .from("sales_returns")
    .select(
      "id, return_number, return_date, status, total_value, reason, sales_order_id"
    )
    .eq("tenant_id", args.tenantId)
    .order("created_at", { ascending: false });
  if (args.status) {
    q = q.eq("status", args.status);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSalesReturnDetail(
  admin: Admin,
  args: { tenantId: string; returnId: string }
) {
  const db = asUntypedAdmin(admin);
  const { data: header, error: hErr } = await db
    .from("sales_returns")
    .select("*")
    .eq("id", args.returnId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  if (!header) return null;

  const { data: items } = await db
    .from("sales_return_items")
    .select("*")
    .eq("sales_return_id", args.returnId);

  return { header, items: items ?? [] };
}
