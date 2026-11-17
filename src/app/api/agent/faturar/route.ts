import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import { emitirNFe, consultarNFe } from "@/modules/faturamento/lib/nfe/focusnfe.service";
import { sendAuthorizedNfeEmail } from "@/modules/fiscal/lib/bling/send-nfe-status-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Robô Faturista — usado pela HD Central quando o Helder diz "faturar PV-X".
 * Autorização: Bearer AGENT_API_KEY, ou sessão de administrador.
 *
 * GET  ?pv=PV-2026-0012 (ou só "12")  → resumo do pedido, itens, travas (gate) e notas já existentes. Não altera nada.
 * POST { pv, acao: "emitir" }    → emite a NF pelo fluxo normal do ERP (Bling/Focus), só se o gate estiver liberado.
 * POST { pv, acao: "consultar" } → atualiza o estado da última nota do pedido.
 * POST { pv, acao: "enviar", to?: [] } → envia a NF autorizada (DANFE + XML) ao cliente pelo Zoho.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function resolveTenant(request: NextRequest, admin: Admin): Promise<string | NextResponse> {
  const key = (process.env.AGENT_API_KEY ?? "").trim();
  const sent = (request.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
  if (key && sent && sent === key) {
    const { data } = await admin.from("tenants").select("id").limit(1);
    return data?.[0]?.id ?? apiError("Tenant não encontrado", 403);
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
  return (await getCurrentTenantId()) ?? apiError("Tenant não encontrado", 403);
}

type Pedido = {
  id: string;
  order_number: string;
  status: string;
  order_date: string | null;
  client_name: string | null;
  client_email: string | null;
  total: number | null;
  invoice_document_type: string | null;
  customer_po_number: string | null;
  fiscal_status: string | null;
  ready_for_invoice: boolean | null;
};

async function acharPedido(admin: Admin, tenant: string, pv: string): Promise<Pedido | string> {
  const db = asUntypedAdmin(admin);
  const q = pv.trim().toUpperCase();
  if (!q) return "Informe o pedido (pv).";
  const campos =
    "id, order_number, status, order_date, client_name, client_email, total, invoice_document_type, customer_po_number, fiscal_status, ready_for_invoice";
  const exato = await db.from("sales_orders").select(campos).eq("tenant_id", tenant).eq("order_number", q).limit(1);
  if (exato.error) return exato.error.message;
  if (exato.data?.length) return exato.data[0] as Pedido;
  const num = q.replace(/\D/g, "");
  if (!num) return `Pedido ${pv} não encontrado.`;
  const parcial = await db
    .from("sales_orders")
    .select(campos)
    .eq("tenant_id", tenant)
    .ilike("order_number", `%${num.replace(/^0+/, "") || "0"}`)
    .order("order_date", { ascending: false })
    .limit(20);
  if (parcial.error) return parcial.error.message;
  const lista = (parcial.data ?? []) as Pedido[];
  const certos = lista.filter(
    (p) => p.order_number.replace(/\D/g, "") === num || Number(p.order_number.split("-").pop()) === Number(num)
  );
  if (certos.length === 1) return certos[0];
  if (certos.length > 1) return `Mais de um pedido bate com "${pv}": ${certos.map((p) => p.order_number).join(", ")}.`;
  return `Pedido ${pv} não encontrado.`;
}

async function notasDo(admin: Admin, tenant: string, soId: string) {
  const db = asUntypedAdmin(admin);
  const { data } = await db
    .from("nfes")
    .select("id, status, provider, nfe_number, nfe_key, pdf_url, xml_url, customer_notified_at, created_at")
    .eq("tenant_id", tenant)
    .eq("sales_order_id", soId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<{
    id: string;
    status: string;
    provider: string | null;
    nfe_number: string | null;
    nfe_key: string | null;
    pdf_url: string | null;
    xml_url: string | null;
    customer_notified_at: string | null;
    created_at: string;
  }>;
}

async function resumo(admin: Admin, tenant: string, so: Pedido) {
  const db = asUntypedAdmin(admin);
  const [{ data: itens }, gate, notas] = await Promise.all([
    db
      .from("sales_order_items")
      .select("line_number, description, quantity, unit, unit_price, total_price")
      .eq("tenant_id", tenant)
      .eq("sales_order_id", so.id)
      .order("line_number"),
    validateSalesOrderCanEmitNfe(admin, tenant, so.id),
    notasDo(admin, tenant, so.id),
  ]);
  return {
    pedido: {
      numero: so.order_number,
      status: so.status,
      data: so.order_date,
      cliente: so.client_name,
      email_cliente: so.client_email,
      total: so.total,
      tipo_nota: so.invoice_document_type,
      pc_cliente: so.customer_po_number,
      fiscal: so.fiscal_status,
      material_pronto: so.ready_for_invoice,
    },
    itens: itens ?? [],
    pode_emitir: gate.ok,
    travas: gate.reasons,
    avisos: gate.warnings,
    notas,
  };
}

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const so = await acharPedido(admin, tenant, request.nextUrl.searchParams.get("pv") ?? "");
  if (typeof so === "string") return apiError(so, 404);
  try {
    return apiOk(await resumo(admin, tenant, so));
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao ler o pedido.", 500);
  }
}

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const body = (await request.json().catch(() => ({}))) as { pv?: string; acao?: string; to?: unknown };
  const so = await acharPedido(admin, tenant, String(body.pv ?? ""));
  if (typeof so === "string") return apiError(so, 404);
  const acao = String(body.acao ?? "");

  try {
    if (acao === "emitir") {
      const gate = await validateSalesOrderCanEmitNfe(admin, tenant, so.id);
      if (!gate.ok) return apiError(`Não dá para emitir ${so.order_number}: ${gate.reasons.join(" ")}`, 400);
      const out = await emitirNFe(admin, tenant, so.id);
      return apiOk({ emitida: true, nfe_id: out.nfe_id, ref: out.focus_ref, ...(await resumo(admin, tenant, so)) });
    }

    if (acao === "consultar") {
      const ultima = (await notasDo(admin, tenant, so.id))[0];
      if (!ultima) return apiError(`${so.order_number} não tem nota.`, 404);
      await consultarNFe(admin, tenant, ultima.id);
      return apiOk(await resumo(admin, tenant, so));
    }

    if (acao === "enviar") {
      const autorizada = (await notasDo(admin, tenant, so.id)).find((n) => n.status === "authorized");
      if (!autorizada) return apiError(`${so.order_number} não tem nota autorizada.`, 400);
      const to = Array.isArray(body.to) ? body.to.filter((e): e is string => typeof e === "string" && e.includes("@")) : undefined;
      const r = await sendAuthorizedNfeEmail(admin, tenant, autorizada.id, {
        force: true,
        toOverride: to && to.length ? to : undefined,
      });
      return apiOk({ ...r, nota: autorizada.nfe_number });
    }

    return apiError('acao deve ser "emitir", "consultar" ou "enviar".', 400);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no faturamento.", 500);
  }
}
