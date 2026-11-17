import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { rejectQuoteWithReasons } from "@/modules/vendas/lib/sales/quote-reject";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Motor de anotações (follow-up de orçamentos) — usado pela HD Central quando o Helder conta
 * como está cada negociação. Autorização: Bearer AGENT_API_KEY, ou sessão de administrador.
 *
 * POST { orcamento: "547" | "ORC-2026-0547", nota: "texto", retomar_em?: "AAAA-MM-DD", dias?: 10,
 *        perdido?: "motivo" , acao?: "o que fazer no retorno" }
 *   → grava a nota no CRM (oportunidade do orçamento), agenda o próximo follow-up
 *     (próxima ação + data) e, se `perdido`, marca o orçamento como rejeitado (motivo mais próximo).
 * GET  [?ate=AAAA-MM-DD] → follow-ups vencidos até a data (padrão: hoje), com a última nota.
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

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const MOTIVOS: Array<[RegExp, string]> = [
  [/pre[cç]o|caro/i, "Preço alto"],
  [/prazo/i, "Prazo de entrega não atendido"],
  [/pagamento|condi[cç]/i, "Condições de pagamento não aceitas"],
  [/indispon/i, "Produto indisponível"],
  [/erro/i, "Erro no orçamento"],
  [/desist|cancel|n[aã]o (vai|vão) fazer|perdeu|perdido|outro fornecedor|fechou com/i, "Cliente desistiu"],
];

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const db = asUntypedAdmin(admin);
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nota = String(b.nota ?? "").trim();

  // Pedido de cotação ainda sem orçamento no ERP → oportunidade "a responder" (aparece na carteira).
  if (b.a_responder === true || typeof b.cliente === "string") {
    const cli = String(b.cliente ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const titulo = String(b.titulo ?? "").trim();
    if ((!cli && !email) || !titulo) return apiError("Informe cliente (ou email) e titulo.", 400);
    let lista: Array<{ id: string; name: string }> = [];
    if (cli) {
      const { data: cs } = await db
        .from("customers")
        .select("id, name, trade_name")
        .eq("tenant_id", tenant)
        .or(`name.ilike.%${cli.replace(/[%,()]/g, " ")}%,trade_name.ilike.%${cli.replace(/[%,()]/g, " ")}%`)
        .limit(5);
      lista = (cs ?? []) as Array<{ id: string; name: string }>;
    } else {
      // Pelo e-mail do remetente: contato do CRM, e-mail do cliente, ou domínio (não genérico).
      const dom = email.split("@")[1] ?? "";
      const generico = /^(gmail|hotmail|outlook|yahoo|live|uol|bol|terra|icloud)\./i.test(dom);
      const { data: ct } = await db.from("crm_contacts").select("customer_id").eq("tenant_id", tenant).ilike("email", email).limit(1);
      const viaContato = (ct?.[0] as { customer_id?: string } | undefined)?.customer_id;
      const filtro = viaContato
        ? `id.eq.${viaContato}`
        : generico || !dom
          ? `email.ilike.${email}`
          : `email.ilike.${email},email.ilike.%@${dom}`;
      const { data: cs } = await db.from("customers").select("id, name, trade_name").eq("tenant_id", tenant).or(filtro).limit(5);
      lista = (cs ?? []) as Array<{ id: string; name: string }>;
    }
    if (lista.length !== 1) return apiError(lista.length ? `Mais de um cliente bate com ${cli || email}: ${lista.map((c) => c.name).join(", ")}` : `Cliente ${cli || email} não encontrado.`, 404);
    const prometido = typeof b.prometido === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.prometido) ? b.prometido : null;
    const falta = String(b.falta ?? "").trim();
    const { data: ex } = await db
      .from("crm_opportunities")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("customer_id", lista[0].id)
      .is("quote_id", null)
      .eq("title", titulo)
      .maybeSingle();
    const campos = { next_action: falta ? `Falta: ${falta}` : "Falta: definir com o Helder", next_action_at: prometido };
    let oppId = (ex as { id?: string } | null)?.id ?? null;
    if (oppId) {
      await db.from("crm_opportunities").update(campos).eq("id", oppId);
    } else {
      const ins = await db
        .from("crm_opportunities")
        .insert({ tenant_id: tenant, customer_id: lista[0].id, title: titulo, stage: "qualificado", source: "cotacao", ...campos })
        .select("id")
        .single();
      if (ins.error) return apiError(ins.error.message, 500);
      oppId = (ins.data as { id: string }).id;
    }
    if (nota) {
      await db.from("crm_activities").insert({ tenant_id: tenant, customer_id: lista[0].id, opportunity_id: oppId, type: "nota", summary: nota.slice(0, 2000), created_by: "claude" });
    }
    return apiOk({ a_responder: true, cliente: lista[0].name, titulo, ...campos });
  }

  const orc = String(b.orcamento ?? "").trim();
  if (!orc || !nota) return apiError("Informe orcamento e nota.", 400);

  const num = orc.match(/(\d+)\D*$/)?.[1] ?? "";
  const { data: qs, error } = await db
    .from("quotes")
    .select("id, quote_number, client_name, customer_id, status, total")
    .eq("tenant_id", tenant)
    .ilike("quote_number", `%${num.replace(/^0+/, "") || "0"}`)
    .limit(20);
  if (error) return apiError(error.message, 500);
  const certos = ((qs ?? []) as Array<{ id: string; quote_number: string; client_name: string; customer_id: string | null; status: string; total: number }>).filter(
    (q) => q.quote_number.toUpperCase() === orc.toUpperCase() || Number(q.quote_number.split("-").pop()) === Number(num)
  );
  if (certos.length !== 1) return apiError(certos.length ? `Mais de um orçamento bate com ${orc}.` : `Orçamento ${orc} não encontrado.`, 404);
  const q = certos[0];

  // Oportunidade do orçamento (o ERP cria uma por orçamento; se não houver, cria aqui).
  let { data: opp } = await db
    .from("crm_opportunities")
    .select("id, stage")
    .eq("tenant_id", tenant)
    .eq("quote_id", q.id)
    .maybeSingle();
  if (!opp) {
    const ins = await db
      .from("crm_opportunities")
      .insert({ tenant_id: tenant, customer_id: q.customer_id, title: `Orçamento ${q.quote_number}`, stage: "proposta", amount: q.total, quote_id: q.id, source: "orcamento" })
      .select("id, stage")
      .single();
    if (ins.error) return apiError("Oportunidade: " + ins.error.message, 500);
    opp = ins.data;
  }
  const oppId = (opp as { id: string }).id;

  const hoje = todayIsoSaoPaulo();
  const retomar =
    typeof b.retomar_em === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.retomar_em)
      ? b.retomar_em
      : typeof b.dias === "number" && b.dias > 0
        ? addDays(hoje, Math.round(b.dias))
        : null;
  const perdido = typeof b.perdido === "string" ? b.perdido.trim() || "perdido" : b.perdido === true ? "perdido" : null;
  const acao = typeof b.acao === "string" && b.acao.trim() ? b.acao.trim() : null;

  const act = await db.from("crm_activities").insert({
    tenant_id: tenant,
    customer_id: q.customer_id,
    opportunity_id: oppId,
    type: "nota",
    summary: `[${q.quote_number}] ${nota}`.slice(0, 2000),
    created_by: "claude",
  });
  if (act.error) return apiError("Nota: " + act.error.message, 500);

  if (perdido) {
    const { data: reasons } = await db.from("rejection_reasons").select("id, reason").eq("tenant_id", tenant);
    const lista = (reasons ?? []) as Array<{ id: string; reason: string }>;
    const alvo = MOTIVOS.find(([re]) => re.test(`${perdido} ${nota}`))?.[1] ?? "Outro";
    const motivo = lista.find((r) => r.reason === alvo) ?? lista.find((r) => r.reason === "Outro") ?? lista[0];
    if (q.status !== "rejected" && motivo) {
      const r = await rejectQuoteWithReasons(admin, tenant, q.id, { reason_ids: [motivo.id], notes: nota });
      if (!r.ok) return apiError("Rejeitar: " + r.message, r.status);
    }
    await db.from("crm_opportunities").update({ stage: "perdido", next_action: null, next_action_at: null }).eq("id", oppId);
    return apiOk({ orcamento: q.quote_number, cliente: q.client_name, perdido: true, motivo: motivo?.reason ?? null });
  }

  const upd: Record<string, unknown> = {};
  if (retomar) upd.next_action_at = retomar;
  if (acao || retomar) upd.next_action = (acao ?? nota).slice(0, 300);
  if (Object.keys(upd).length) {
    const u = await db.from("crm_opportunities").update(upd).eq("id", oppId);
    if (u.error) return apiError("Follow-up: " + u.error.message, 500);
  }
  return apiOk({ orcamento: q.quote_number, cliente: q.client_name, nota_salva: true, retomar_em: retomar, proxima_acao: upd.next_action ?? null });
}

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const db = asUntypedAdmin(admin);
  const ate = request.nextUrl.searchParams.get("ate") ?? todayIsoSaoPaulo();
  const { data, error } = await db
    .from("crm_opportunities")
    .select("id, title, stage, amount, next_action, next_action_at, quote:quotes(quote_number, client_name, status)")
    .eq("tenant_id", tenant)
    .not("next_action_at", "is", null)
    .lte("next_action_at", ate)
    .not("stage", "in", "(ganho,perdido)")
    .order("next_action_at", { ascending: true });
  if (error) return apiError(error.message, 500);
  return apiOk({ ate, followups: data ?? [] });
}
