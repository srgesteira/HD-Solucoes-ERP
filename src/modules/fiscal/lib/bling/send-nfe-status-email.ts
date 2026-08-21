import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { loadTenantMailConfig } from "@/shared/utils/email/load-tenant-mail-config";
import { sendOutboundEmail } from "@/shared/utils/email/send-outbound-email";
import type { OutboundAttachment } from "@/shared/utils/email/send-outbound-email";

type Admin = SupabaseClient<Database>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchAsAttachment(
  url: string | null | undefined,
  filename: string,
  contentType: string
): Promise<OutboundAttachment | null> {
  const href = url?.trim();
  if (!href) return null;
  try {
    const res = await fetch(href, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return { filename, content: buf, contentType };
  } catch {
    return null;
  }
}

export async function sendAuthorizedNfeEmail(
  admin: Admin,
  tenantId: string,
  nfeId: string,
  opts?: { force?: boolean; toOverride?: string[] }
): Promise<{ sent: boolean; message: string }> {
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
  if (!nfe) throw new Error("NF-e não encontrada.");
  if (nfe.status !== "authorized") {
    throw new Error("Só é possível enviar NF-e autorizada.");
  }
  if (!nfe.sales_order_id) throw new Error("NF-e sem pedido de venda.");
  if (nfe.customer_notified_at && !opts?.force) {
    return { sent: false, message: "O cliente já foi notificado desta nota." };
  }

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
  if (!so) throw new Error("Pedido de venda não encontrado.");

  const recipients = (
    opts?.toOverride?.length ? opts.toOverride : [so.client_email]
  )
    .map((e) => (e ?? "").trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    await db
      .from("nfes")
      .update({
        customer_notify_error:
          "Cliente sem e-mail — não foi possível enviar DANFE/XML.",
      })
      .eq("id", nfeId)
      .eq("tenant_id", tenantId);
    throw new Error(
      "Cliente sem e-mail. Cadastre o e-mail no cliente ou no pedido."
    );
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
  const numero = nfe.nfe_number?.trim() || "";
  const danfeName = numero
    ? `DANFE-${numero.replace(/\D/g, "")}.pdf`
    : `DANFE-${so.order_number}.pdf`;
  const xmlName = numero
    ? `NFe-${numero.replace(/\D/g, "")}.xml`
    : `NFe-${so.order_number}.xml`;

  const attachments = (
    await Promise.all([
      fetchAsAttachment(nfe.pdf_url, danfeName, "application/pdf"),
      fetchAsAttachment(nfe.xml_url, xmlName, "application/xml"),
    ])
  ).filter((a): a is OutboundAttachment => a != null);

  const links = [
    nfe.pdf_url
      ? `<p><a href="${escapeHtml(nfe.pdf_url)}">Abrir DANFE (PDF)</a></p>`
      : "",
    nfe.xml_url
      ? `<p><a href="${escapeHtml(nfe.xml_url)}">Descarregar XML</a></p>`
      : "",
  ].join("");

  const mail = await loadTenantMailConfig(admin, tenantId);
  const result = await sendOutboundEmail({
    to: recipients,
    subject: `Nota fiscal ${numero ? numero + " " : ""}autorizada — pedido ${so.order_number}`.trim(),
    html: `
      <p>Prezado(a) ${escapeHtml(so.client_name)},</p>
      <p>Segue a nota fiscal do pedido <strong>${escapeHtml(so.order_number)}</strong>${numero ? ` (n.º ${escapeHtml(numero)})` : ""}.</p>
      ${nfe.nfe_key ? `<p>Chave de acesso: <code>${escapeHtml(nfe.nfe_key)}</code></p>` : ""}
      ${attachments.length ? "<p>Em anexo: DANFE (PDF) e XML.</p>" : links}
      ${attachments.length ? links : ""}
      <p>${escapeHtml(brand)}</p>
    `,
    attachments,
    mail,
  });

  await db
    .from("nfes")
    .update({
      customer_notified_at:
        result.sent || result.simulated ? new Date().toISOString() : null,
      customer_notify_error: result.sent
        ? null
        : result.message ?? "Envio de e-mail não concluído.",
    })
    .eq("id", nfeId)
    .eq("tenant_id", tenantId);

  return {
    sent: Boolean(result.sent),
    message: result.message ?? (result.sent ? "E-mail enviado." : "Não enviado."),
  };
}

/**
 * Gatilho automático após autorização. Não reenvia se já notificado.
 */
export async function notifyCustomerNfeAuthorized(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<void> {
  try {
    await sendAuthorizedNfeEmail(admin, tenantId, nfeId);
  } catch (e) {
    const db = asUntypedAdmin(admin);
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
