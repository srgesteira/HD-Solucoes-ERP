import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { authenticateAgent } from "@/modules/agent/lib/governance";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/arquivos-autorizados — Norma v1.2, item 9. Referência dos hashes dos arquivos de dono único, fora do PC.
 *
 * GET (robô/script: Bearer hdr_... ou chave antiga) → { itens: [{ arquivo, sha256, atualizado_em, atualizado_por }] }
 * PUT (SÓ sessão de administrador; qualquer Authorization é recusado) { itens: [{ arquivo, sha256 }] }
 *   → grava e registra no histórico. Robô nenhum consegue trocar a referência.
 */

const ARQUIVOS = ["COHD-contexto.md", "mapa-robos.md", "norma-estrutura.md", "INSTRUCOES.md"];

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request, "arquivos.ler", { skipWindow: true, skipRateLimit: true });
  if (!auth.ok) return auth.response;
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await db
    .from("arquivos_autorizados")
    .select("arquivo, sha256, atualizado_em, atualizado_por")
    .eq("tenant_id", auth.tenantId)
    .order("arquivo");
  if (error) return apiError("Erro ao ler arquivos autorizados.", 500);
  return apiOk({ itens: data ?? [] });
}

export async function PUT(request: NextRequest) {
  if ((request.headers.get("authorization") ?? "").trim()) {
    return apiError("Só o administrador, pela sessão do ERP, grava a referência.", 403);
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Só administrador.", 403);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const quem = `admin:${user?.email ?? user?.id ?? "?"}`;

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("JSON inválido", 400); }
  const itens = (body as { itens?: unknown })?.itens;
  if (!Array.isArray(itens) || itens.length === 0) return apiError("itens obrigatório", 400);
  const linhas = [];
  for (const it of itens as Array<{ arquivo?: unknown; sha256?: unknown }>) {
    const arquivo = String(it?.arquivo ?? "");
    const sha256 = String(it?.sha256 ?? "").toLowerCase();
    if (!ARQUIVOS.includes(arquivo)) return apiError(`arquivo inválido: ${arquivo}`, 400);
    if (!/^[0-9a-f]{64}$/.test(sha256)) return apiError(`sha256 inválido para ${arquivo}`, 400);
    linhas.push({ tenant_id: tenantId, arquivo, sha256, atualizado_em: new Date().toISOString(), atualizado_por: quem });
  }
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const { error } = await db.from("arquivos_autorizados").upsert(linhas, { onConflict: "tenant_id,arquivo" });
  if (error) return apiError("Erro ao gravar.", 500);
  await db.from("arquivos_autorizados_hist").insert(linhas);
  return apiOk({ ok: true, gravados: linhas.map((l) => l.arquivo) });
}
