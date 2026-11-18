import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { loadTenantMailConfig } from "@/shared/utils/email/load-tenant-mail-config";
import { sendMessage } from "@/modules/agent/lib/zoho-mailbox";
import { montarEmail, segmentoDe, type Passo } from "@/modules/agent/lib/prospeccao-modelos";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Robô Prospector (n8n). Autorização: Bearer AGENT_API_KEY, ou sessão de administrador.
 *
 * GET  ?limite=5            → quem está na agenda de prospecção hoje (sem enviar nada)
 * POST { limite?: 5, dry_run?: true }
 *   → para cada prospect da agenda (lead/contato com próximo contato até hoje e e-mail):
 *     monta o e-mail pelo modelo do segmento (1º contato, follow-up 1, follow-up 2),
 *     envia pelo Zoho do helder@, registra no CRM e agenda o próximo passo
 *     (1º → FU1 em 7 dias · FU1 → FU2 em 14 dias · FU2 → inativo, volta em 90 dias).
 *   → dry_run devolve os e-mails montados sem enviar nem gravar.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const NUNCA = /(asmontec|fbc92@uol|hepafiltros|grupomestra|speedair|qualitynew|ratts|fgenergy|hdindustrial)/i;
const GENERICO = /^(comercial|vendas|contato|compras|engenharia|atendimento|sac|financeiro|rh|suporte|orcamento|orçamento|projetos?)$/i;

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

const primeiroNome = (s: string | null | undefined): string | null => {
  const w = String(s ?? "").trim().split(/\s+/)[0] ?? "";
  if (w.length < 2 || GENERICO.test(w) || /@/.test(w)) return null;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};

type Item = {
  id: string;
  empresa: string;
  email: string;
  nome: string | null;
  segmento: string | null;
  gancho: string | null;
  passo: Passo | "encerrar";
  assuntoAnterior: string | null;
};

async function agenda(admin: Admin, tenant: string, limite: number): Promise<Item[]> {
  const db = asUntypedAdmin(admin);
  const hoje = todayIsoSaoPaulo();
  const { data: clientes, error } = await db
    .from("customers")
    .select("id, name, trade_name, email, segment, next_contact_at, next_action")
    .eq("tenant_id", tenant)
    .eq("is_active", true)
    .in("crm_stage", ["lead", "contato"])
    .lte("next_contact_at", hoje)
    .order("next_contact_at", { ascending: true })
    .limit(limite * 4);
  if (error) throw new Error(error.message);

  const itens: Item[] = [];
  for (const c of (clientes ?? []) as Array<Record<string, string | null>>) {
    if (itens.length >= limite) break;
    const id = String(c.id);
    // Próxima ação escrita à mão (ex.: "e-mail voltou", "conferir conversa ativa") = não é com o robô.
    const proxima = String(c.next_action ?? "").trim();
    if (proxima && !/^(prospec[cç][aã]o\b|1\s*[ºo°]?\s*contato\b|primeiro contato\b)/i.test(proxima)) continue;
    const [{ data: contatos }, { data: ativ }] = await Promise.all([
      db.from("crm_contacts").select("name, email, is_primary").eq("customer_id", id).order("is_primary", { ascending: false }),
      db
        .from("crm_activities")
        .select("type, direction, summary, occurred_at")
        .eq("customer_id", id)
        .order("occurred_at", { ascending: false })
        .limit(30),
    ]);
    const contato = ((contatos ?? []) as Array<Record<string, string | null>>).find((k) => k.email) ?? null;
    const email = String(contato?.email ?? c.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || NUNCA.test(email)) continue;

    const lista = (ativ ?? []) as Array<Record<string, string | null>>;
    if (lista.some((a) => a.direction === "entrada")) continue; // já respondeu: é com a HD Central
    const enviados = lista.filter((a) => a.type === "email" && a.direction !== "entrada");
    const nota = lista.find((a) => a.type === "nota" && /Gancho:/i.test(String(a.summary ?? "")));
    const gancho = nota ? String(nota.summary).replace(/^.*?Gancho:\s*/i, "").split(" · Histórico:")[0].trim() : null;
    const comAssunto = enviados.find((a) => /assunto:/i.test(String(a.summary ?? "")));
    const assuntoAnterior = comAssunto ? String(comAssunto.summary).replace(/^.*assunto:\s*/i, "").trim() : null;

    const passo: Item["passo"] = enviados.length === 0 ? "1o" : enviados.length === 1 ? "fu1" : enviados.length === 2 ? "fu2" : "encerrar";
    itens.push({
      id,
      empresa: String(c.trade_name ?? c.name ?? ""),
      email,
      nome: primeiroNome(contato?.name),
      segmento: c.segment,
      gancho,
      passo,
      assuntoAnterior,
    });
  }
  return itens;
}

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const limite = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limite") ?? 5) || 5));
  try {
    const itens = await agenda(admin, tenant, limite);
    return apiOk({ hoje: todayIsoSaoPaulo(), itens: itens.map((i) => ({ ...i, modelo: segmentoDe(i.segmento).chave })) });
  } catch (e) {
    return apiError("Erro na agenda: " + (e instanceof Error ? e.message : String(e)), 500);
  }
}

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  let b: { limite?: number; dry_run?: boolean } = {};
  try {
    b = await request.json();
  } catch {
    /* corpo vazio = padrão */
  }
  const limite = Math.min(50, Math.max(1, Number(b.limite ?? 5) || 5));
  const dry = b.dry_run === true;
  const db = asUntypedAdmin(admin);
  const hoje = todayIsoSaoPaulo();

  let itens: Item[];
  try {
    itens = await agenda(admin, tenant, limite);
  } catch (e) {
    return apiError("Erro na agenda: " + (e instanceof Error ? e.message : String(e)), 500);
  }
  const cfg = dry ? null : await loadTenantMailConfig(admin, tenant);
  if (!dry && !cfg) return apiError("SMTP/IMAP não configurado no ERP.", 500);

  const enviados: unknown[] = [];
  const encerrados: unknown[] = [];
  const erros: unknown[] = [];

  for (const it of itens) {
    if (it.passo === "encerrar") {
      if (!dry) {
        await db
          .from("customers")
          .update({ crm_stage: "inativo", next_contact_at: addDays(hoje, 90), next_action: "Prospecção: voltar após 90 dias" })
          .eq("id", it.id)
          .eq("tenant_id", tenant);
      }
      encerrados.push({ empresa: it.empresa });
      continue;
    }
    const { assunto, texto } = montarEmail({
      passo: it.passo,
      nome: it.nome,
      segmento: it.segmento,
      gancho: it.gancho,
      assuntoAnterior: it.assuntoAnterior,
    });
    if (dry) {
      enviados.push({ empresa: it.empresa, para: it.email, passo: it.passo, assunto, texto });
      continue;
    }
    try {
      await sendMessage(cfg!, { to: [it.email], subject: assunto, text: texto });
      const rotulo = it.passo === "1o" ? "1º contato" : it.passo === "fu1" ? "follow-up 1" : "follow-up 2";
      await db.from("crm_activities").insert({
        tenant_id: tenant,
        customer_id: it.id,
        type: "email",
        direction: "saida",
        summary: `Prospecção ${rotulo} (robô) para ${it.email} | assunto: ${assunto}`,
        done: true,
        created_by: "robo-prospector",
      });
      const prox =
        it.passo === "1o"
          ? { next_contact_at: addDays(hoje, 7), next_action: "Prospecção: follow-up 1" }
          : it.passo === "fu1"
            ? { next_contact_at: addDays(hoje, 14), next_action: "Prospecção: follow-up 2 (último)" }
            : { next_contact_at: addDays(hoje, 14), next_action: "Prospecção: encerrar se não responder" };
      await db.from("customers").update(prox).eq("id", it.id).eq("tenant_id", tenant);
      enviados.push({ empresa: it.empresa, para: it.email, passo: it.passo, assunto });
    } catch (e) {
      erros.push({ empresa: it.empresa, para: it.email, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return apiOk({ hoje, dry_run: dry, enviados, encerrados, erros });
}
