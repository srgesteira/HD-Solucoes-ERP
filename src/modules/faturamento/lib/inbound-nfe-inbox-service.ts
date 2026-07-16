import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  FocusMdeNotAvailableError,
  getNfeRecebidaXmlHttp,
  listNfesRecebidasHttp,
  manifestarNfeRecebidaHttp,
  type FocusReceivedNfeSummary,
} from "@/modules/faturamento/lib/nfe/focus-received-nfe";
import type { FocusNFeEnv } from "@/modules/faturamento/lib/nfe/focusnfe.service";
import { parsePurchaseNfeXml } from "@/modules/compras/lib/purchasing/parse-purchase-nfe-xml";
import { buildPurchaseInvoiceReconciliation } from "@/modules/compras/lib/purchasing/purchase-invoice-reconcile";

type Admin = SupabaseClient<Database>;

export type InboundNfeInboxRow = {
  id: string;
  access_key: string;
  issuer_name: string | null;
  issuer_document: string | null;
  issue_date: string | null;
  total_amount: number | null;
  status: "new" | "linked" | "ignored";
  purchase_order_id: string | null;
  created_at: string;
};

function accessKeyOf(row: FocusReceivedNfeSummary): string {
  const raw = String(row.chave_nfe ?? row.chave ?? "").replace(/\D/g, "");
  return raw.length >= 44 ? raw.slice(-44) : raw;
}

export async function listInboundNfeInbox(
  admin: Admin,
  tenantId: string,
  opts?: { status?: string; limit?: number }
): Promise<InboundNfeInboxRow[]> {
  const db = asUntypedAdmin(admin);
  let q = db
    .from("inbound_nfe_inbox")
    .select(
      "id, access_key, issuer_name, issuer_document, issue_date, total_amount, status, purchase_order_id, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .limit(opts?.limit ?? 50);

  if (opts?.status) {
    q = q.eq("status", opts.status);
  } else {
    q = q.in("status", ["new", "linked"]);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundNfeInboxRow[];
}

export async function syncInboundNfeInboxFromFocus(
  admin: Admin,
  tenantId: string
): Promise<{
  imported: number;
  skipped: number;
  mdeAvailable: true;
}> {
  const { data: settings, error: csErr } = await admin
    .from("company_settings")
    .select("cnpj, focusnfe_token, focusnfe_environment")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (csErr) throw new Error(csErr.message);

  const token = settings?.focusnfe_token?.trim();
  if (!token) throw new Error("Token FocusNFe não configurado (Empresa).");
  const cnpj = String(settings?.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    throw new Error("CNPJ da empresa inválido ou ausente.");
  }
  const env: FocusNFeEnv =
    settings?.focusnfe_environment === "producao" ? "producao" : "homologacao";

  const db = asUntypedAdmin(admin);
  const { data: maxRow } = await db
    .from("inbound_nfe_inbox")
    .select("focus_version")
    .eq("tenant_id", tenantId)
    .order("focus_version", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const maxVersion =
    maxRow && typeof (maxRow as { focus_version?: number }).focus_version === "number"
      ? (maxRow as { focus_version: number }).focus_version
      : null;

  let listResult;
  try {
    listResult = await listNfesRecebidasHttp({
      token,
      env,
      cnpj,
      versao: maxVersion,
    });
  } catch (e) {
    if (e instanceof FocusMdeNotAvailableError) throw e;
    throw e;
  }

  if (!listResult.ok) {
    const rawMsg =
      listResult.raw && typeof listResult.raw === "object"
        ? String(
            (listResult.raw as Record<string, unknown>).mensagem ??
              (listResult.raw as Record<string, unknown>).message ??
              ""
          )
        : "";
    throw new FocusMdeNotAvailableError(
      rawMsg ||
        `Focus nfes_recebidas HTTP ${listResult.status}. Verifique se o contrato inclui MDe.`
    );
  }

  let imported = 0;
  let skipped = 0;

  for (const row of listResult.data) {
    const key = accessKeyOf(row);
    if (!key || key.length < 44) {
      skipped += 1;
      continue;
    }

    try {
      await manifestarNfeRecebidaHttp({
        token,
        env,
        chave: key,
        tipo: "ciencia",
      });
    } catch {
      /* ciência pode já existir */
    }

    let xml: string | null = null;
    try {
      const xmlRes = await getNfeRecebidaXmlHttp({ token, env, chave: key });
      if (xmlRes.ok) xml = xmlRes.xml;
    } catch {
      /* XML opcional no sync */
    }

    const issuerName =
      typeof row.nome_emitente === "string" ? row.nome_emitente : null;
    const issuerDoc = String(
      row.documento_emitente ?? row.cnpj_emitente ?? ""
    ).replace(/\D/g, "") || null;
    const issueDate =
      typeof row.data_emissao === "string"
        ? row.data_emissao.slice(0, 10)
        : null;
    const total =
      typeof row.valor_total === "number"
        ? row.valor_total
        : Number(row.valor_total ?? NaN);
    const version =
      typeof row.versao === "number" ? row.versao : Number(row.versao ?? NaN);

    const { error: upsertErr } = await db.from("inbound_nfe_inbox").upsert(
      {
        tenant_id: tenantId,
        access_key: key,
        issuer_name: issuerName,
        issuer_document: issuerDoc,
        issue_date: issueDate,
        total_amount: Number.isFinite(total) ? total : null,
        xml_content: xml,
        json_payload: row,
        focus_version: Number.isFinite(version) ? version : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,access_key", ignoreDuplicates: false }
    );

    if (upsertErr) {
      skipped += 1;
      continue;
    }
    imported += 1;
  }

  return { imported, skipped, mdeAvailable: true };
}

export async function ignoreInboundNfeInboxItem(
  admin: Admin,
  tenantId: string,
  id: string
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("inbound_nfe_inbox")
    .update({ status: "ignored", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

export async function getInboundNfeReconcilePayload(
  admin: Admin,
  tenantId: string,
  id: string
) {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("inbound_nfe_inbox")
    .select("id, access_key, xml_content, status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NF recebida não encontrada.");
  const row = data as {
    id: string;
    access_key: string;
    xml_content: string | null;
    status: string;
  };
  if (!row.xml_content?.trim()) {
    throw new Error(
      "XML da nota não está disponível — sincronize novamente ou importe manualmente."
    );
  }

  const extraction = parsePurchaseNfeXml(Buffer.from(row.xml_content, "utf8"));
  const reconcile = await buildPurchaseInvoiceReconciliation(
    admin,
    tenantId,
    extraction
  );

  return {
    inboxId: row.id,
    accessKey: row.access_key,
    source: "mde_inbox" as const,
    ...reconcile,
  };
}

export { FocusMdeNotAvailableError };
