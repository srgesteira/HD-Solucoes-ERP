import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { loadTenantMailConfig } from "@/shared/utils/email/load-tenant-mail-config";
import { sendOutboundEmail } from "@/shared/utils/email/send-outbound-email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem testar o e-mail.", 403);
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let to = "";
  try {
    const body = (await request.json()) as { to?: unknown };
    to = typeof body.to === "string" ? body.to.trim() : "";
  } catch {
    to = "";
  }

  const admin = createSupabaseAdminClient();
  const mail = await loadTenantMailConfig(admin, tenantId);
  if (!to) {
    to = mail?.from.match(/<([^>]+)>/)?.[1]?.trim() || mail?.user || "";
  }
  if (!to) return apiError("Indique um e-mail de destino para o teste.", 400);
  if (!mail) {
    return apiError(
      "Zoho Mail não configurado. Preencha e-mail, senha da aplicação e grave em Empresa → Integrações.",
      400
    );
  }

  try {
    const result = await sendOutboundEmail({
      to: [to],
      subject: "Teste de e-mail — ERP HD Soluções",
      html: `<p>Este é um teste do Zoho Mail ligado ao ERP.</p><p>Se recebeu esta mensagem, o envio de orçamentos, pedidos de compra e DANFE/XML está pronto.</p>`,
      mail,
    });
    return apiOk({ data: result });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Falha no teste de e-mail",
      500
    );
  }
}
