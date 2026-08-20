import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { sendResendEmail } from "@/shared/utils/email/send-resend-email";

type Admin = SupabaseClient<Database>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Gatilho «nota emitida → e-mail de status ao cliente».
 * Idempotente via `customer_notified_at`. Falha de e-mail fica visível
 * em `customer_notify_error` e não reverte a autorização da nota.
 */
export async function notifyCustomerNfeAuthorized(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { data: nfeRaw, error: nfeErr } = await db
    .from("nfes")
    .select(
      "id, status, nfe_number, nfe_key, pdf_url, xml_url, sales_order_id, customer_notified_at, provider"
    )
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (nfeErr) throw new Error(nfeErr.message);
  const nfe = nfeRaw as {
    id: string;
    status: string;
    nfe_number: string | null;
    nfe_key: string | null;
    pdf_url: string | null;
    xml_url: string | null;
    sales_order_id: string | null;
    customer_notified_at: string | null;
    provider: string | null;
  } | null;
  if (!nfe || nfe.status !== "authorized" || nfe.customer_notified_at) return;
  if (!nfe.sales_order_id) return;

  const { data: soRaw } = await db
    .from("sales_orders")
    .select("order_number, client_name, client_email")
    .eq("id", nfe.sales_order_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const so = soRaw as {
    order_number: string;
    client_name: string;
    client_email: string | null;
  } | null;
  if (!so) return;

  const to = so.client_email?.trim();
  if (!to) {
    await db
      .from("nfes")
      .update({
        customer_notify_error:
          "Cliente sem e-mail — não foi possível enviar o status da nota.",
      })
      .eq("id", nfeId)
      .eq("tenant_id", tenantId);
    return;
  }

  const { data: company } = await admin
    .from("company_settings")
    .select("company_name, trade_name")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const brand =
    company?.trade_name?.trim() ||
    company?.company_name?.trim() ||
    "HD Soluções";
  const numero = nfe.nfe_number ? `n.º ${escapeHtml(nfe.nfe_number)}` : "";
  const links = [
    nfe.pdf_url
      ? `<p><a href="${escapeHtml(nfe.pdf_url)}">Abrir DANFE (PDF)</a></p>`
      : "",
    nfe.xml_url
      ? `<p><a href="${escapeHtml(nfe.xml_url)}">Descarregar XML</a></p>`
      : "",
  ].join("");

  try {
    const result = await sendResendEmail({
      to: [to],
      subject: `Nota fiscal ${numero} autorizada — pedido ${so.order_number}`.trim(),
      html: `
        <p>Prezado(a) ${escapeHtml(so.client_name)},</p>
        <p>A nota fiscal do pedido <strong>${escapeHtml(so.order_number)}</strong> foi autorizada${numero ? ` (${numero})` : ""}.</p>
        ${nfe.nfe_key ? `<p>Chave de acesso: <code>${escapeHtml(nfe.nfe_key)}</code></p>` : ""}
        ${links}
        <p>${escapeHtml(brand)}</p>
      `,
    });
    await db
      .from("nfes")
      .update({
        customer_notified_at: result.sent || result.simulated
          ? new Date().toISOString()
          : null,
        customer_notify_error: result.sent
          ? null
          : result.message ?? "Envio de e-mail não concluído.",
      })
      .eq("id", nfeId)
      .eq("tenant_id", tenantId);
  } catch (e) {
    await db
      .from("nfes")
      .update({
        customer_notify_error:
          e instanceof Error ? e.message : "Falha ao enviar e-mail da nota.",
      })
      .eq("id", nfeId)
      .eq("tenant_id", tenantId);
  }
}
