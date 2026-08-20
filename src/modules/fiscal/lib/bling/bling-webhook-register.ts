import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { blingGet, blingPost } from "@/modules/fiscal/lib/bling/bling-client";
import { blingWebhookUrl } from "@/modules/fiscal/lib/bling/bling-env";
import { unwrapBlingData } from "@/modules/fiscal/lib/bling/bling-nfe-status";

type Admin = SupabaseClient<Database>;

/** Módulo de webhook de NF-e na API de notificações v3. */
const INVOICE_WEBHOOK_MODULO = "nota.fiscal";

export async function ensureBlingInvoiceWebhook(
  admin: Admin,
  tenantId: string
): Promise<number | null> {
  const url = blingWebhookUrl();
  const listed = await blingGet(admin, tenantId, "/notificacoes?limite=100");
  const items = Array.isArray((listed as { data?: unknown }).data)
    ? ((listed as { data: Array<Record<string, unknown>> }).data)
    : [];
  const existing = items.find((n) => {
    const nUrl = typeof n.url === "string" ? n.url : "";
    const modulo = String(n.modulo ?? n.evento ?? "");
    return nUrl === url && /nota|invoice|nfe/i.test(modulo);
  });
  if (existing) {
    const id = Number(existing.id);
    return Number.isFinite(id) ? id : null;
  }

  const created = await blingPost(admin, tenantId, "/notificacoes", {
    url,
    descricao: "HD Soluções ERP — status NF-e",
    modulo: INVOICE_WEBHOOK_MODULO,
    ativo: true,
  });
  const data = unwrapBlingData(created);
  const id = Number(data?.id);
  if (!Number.isFinite(id)) return null;

  const db = asUntypedAdmin(admin);
  await db
    .from("bling_credentials")
    .update({ webhook_id: id })
    .eq("tenant_id", tenantId);
  return id;
}
