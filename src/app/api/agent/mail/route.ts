import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { loadTenantMailConfig } from "@/shared/utils/email/load-tenant-mail-config";
import { listMessages, readMessage, searchMessages, sendMessage } from "@/modules/agent/lib/zoho-mailbox";

import { authenticateAgent, comLogDoRobo, travaEfeitoExternoDoRobo } from "@/modules/agent/lib/governance";

/** E-mail do dono: único destino permitido para robôs com token próprio (e-mail reserva do Escalar). */
const EMAIL_DONO = (process.env.HELDER_EMAIL ?? "helder@hdindustrial.ind.br").toLowerCase();
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/agent/mail — caixa de e-mail para o assistente, em texto compacto.
 * GET  ?op=list&folder=inbox|sent&days=2&limit=30
 * GET  ?op=search&q=texto&limit=10
 * GET  ?op=read&folder=inbox&uid=123[&full=1]
 * POST { to:[], cc?:[], subject?, text, reply?:{folder,uid} }  → envia e guarda em Enviados
 * Só administradores (sessão) ou Bearer AGENT_API_KEY.
 */
async function resolveTenant(request: NextRequest): Promise<string | NextResponse> {
  const key = process.env.AGENT_API_KEY;
  const admin = createSupabaseAdminClient();
  if (key && request.headers.get("authorization") === `Bearer ${key}`) {
    const { data } = await admin.from("tenants").select("id").limit(1);
    return data?.[0]?.id ?? apiError("Tenant não encontrado", 403);
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Apenas administradores.", 403);
  return (await getCurrentTenantId()) ?? apiError("Tenant não encontrado", 403);
}

const text = (s: string, status = 200) =>
  new NextResponse(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

async function config(tenantId: string) {
  const cfg = await loadTenantMailConfig(createSupabaseAdminClient(), tenantId);
  if (!cfg) throw new Error("SMTP/IMAP não configurado no ERP.");
  return cfg;
}

async function getHandler(request: NextRequest) {
  const t = await resolveTenant(request);
  if (typeof t !== "string") return t;
  const sp = request.nextUrl.searchParams;
  const op = sp.get("op") ?? "list";
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 30) || 30));
  try {
    const cfg = await config(t);
    if (op === "list") {
      return text(await listMessages(cfg, sp.get("folder") ?? "inbox", Math.max(1, Number(sp.get("days") ?? 2) || 2), limit));
    }
    if (op === "search") {
      const q = (sp.get("q") ?? "").trim();
      if (!q) return text("Informe q.", 400);
      return text(await searchMessages(cfg, q, Math.min(limit, 15)));
    }
    if (op === "read") {
      const uid = Number(sp.get("uid"));
      if (!uid) return text("Informe uid.", 400);
      return text(await readMessage(cfg, sp.get("folder") ?? "inbox", uid, sp.get("full") === "1"));
    }
    return text("op inválida", 400);
  } catch (e) {
    return text("Erro: " + (e instanceof Error ? e.message : String(e)), 500);
  }
}

async function postHandler(request: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return text("JSON inválido", 400);
  }
  const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean);
  const to = list(b.to);
  if (!to.length || !b.text) return text("Informe to e text.", 400);

  // Robô com token próprio (hdr_): só pode mandar aviso simples para o dono (e-mail reserva).
  let t: string | NextResponse;
  if (/^(bearer\s+)?hdr_/i.test((request.headers.get("authorization") ?? "").trim())) {
    const soDono = to.every((x) => x.toLowerCase() === EMAIL_DONO) && !list(b.cc).length && !b.anexos && !b.reply;
    if (!soDono) return apiError("Robô só pode enviar e-mail para o dono.", 403);
    const auth = await authenticateAgent(request, "mail.aviso_dono");
    t = auth.ok ? auth.tenantId : auth.response;
  } else {
    t = await resolveTenant(request);
  }
  if (typeof t !== "string") return t;
  const trava = await travaEfeitoExternoDoRobo(request, t, "mail.enviar");
  if (trava) return trava;
  const reply = b.reply as { folder?: string; uid?: number } | undefined;
  try {
    const cfg = await config(t);
    return text(
      await sendMessage(cfg, {
        to,
        cc: list(b.cc),
        subject: b.subject ? String(b.subject) : undefined,
        text: String(b.text),
        reply: reply?.uid ? { folder: reply.folder ?? "inbox", uid: Number(reply.uid) } : undefined,
        attachments: Array.isArray(b.anexos)
          ? (b.anexos as Array<{ nome?: string; base64?: string; tipo?: string }>)
              .filter((a) => a?.nome && a?.base64)
              .map((a) => ({ filename: String(a.nome), content: Buffer.from(String(a.base64), "base64"), contentType: a.tipo }))
          : undefined,
      })
    );
  } catch (e) {
    return text("Erro: " + (e instanceof Error ? e.message : String(e)), 500);
  }
}

export const GET = comLogDoRobo("mail", "hd_central", getHandler);
export const POST = comLogDoRobo("mail", "hd_central", postHandler);
