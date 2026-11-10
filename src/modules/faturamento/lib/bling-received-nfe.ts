/**
 * NF-e emitidas contra o nosso CNPJ, lidas do Bling (Suprimentos › Notas de entrada).
 *
 * O Bling busca na SEFAZ as notas recebidas (busca automática + manifestação).
 * Depois de confirmadas, elas aparecem em `GET /nfe?tipo=0`. Aqui:
 *  1. lista as NF-e de entrada dos últimos N dias;
 *  2. descarta as emitidas pelo próprio CNPJ (devolução etc.);
 *  3. grava/atualiza `inbound_nfe_inbox` (com XML quando disponível);
 *  4. sugere o PC aberto do mesmo fornecedor;
 *  5. lança contas a pagar pelas parcelas da NF quando NÃO há PC com parcelas
 *     (se há PC, o PC já gera a previsão — não duplica).
 *
 * Não usa colunas novas: metadados ficam em `json_payload` (source = "bling").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { blingGet, blingFetchText } from "@/modules/fiscal/lib/bling/bling-client";
import { findSupplierByDocument } from "@/modules/compras/lib/purchasing/purchase-invoice-reconcile";

type Admin = SupabaseClient<Database>;

type BlingNfeListRow = {
  id: number;
  tipo?: number;
  situacao?: number;
  numero?: string;
  dataEmissao?: string;
  chaveAcesso?: string;
  contato?: { id?: number; nome?: string; numeroDocumento?: string };
};

type BlingNfeDetail = BlingNfeListRow & {
  serie?: string | number;
  valorNota?: number;
  valorFrete?: number;
  xml?: string;
  linkDanfe?: string;
  parcelas?: Array<{ data?: string; valor?: number; observacoes?: string }>;
};

export type BlingInboxMeta = {
  source: "bling";
  bling_id: number;
  numero: string | null;
  serie: string | null;
  link_danfe: string | null;
  parcelas: Array<{ data: string; valor: number }>;
  supplier_id: string | null;
  suggested_po: { id: string; po_number: string } | null;
  /** IDs de contas a pagar criadas a partir desta NF (quando não há PC). */
  payable_ids: string[];
  payables_note: string;
  synced_at: string;
};

export type BlingReceivedSyncResult = {
  fetched: number;
  imported: number;
  updated: number;
  skipped_own: number;
  payables_created: number;
  errors: string[];
};

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function listBlingEntradaSince(
  admin: Admin,
  tenantId: string,
  sinceIso: string
): Promise<BlingNfeListRow[]> {
  const out: BlingNfeListRow[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const qs = new URLSearchParams({
      tipo: "0",
      pagina: String(pagina),
      limite: "100",
      dataEmissaoInicial: `${sinceIso} 00:00:00`,
    });
    const res = await blingGet<{ data?: BlingNfeListRow[] }>(
      admin,
      tenantId,
      `/nfe?${qs.toString()}`
    );
    const rows = res?.data ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

async function suggestOpenPurchaseOrder(
  admin: Admin,
  tenantId: string,
  supplierId: string,
  total: number | null
): Promise<{ id: string; po_number: string } | null> {
  const { data, error } = await admin
    .from("purchase_orders")
    .select("id, po_number, total, status, order_date")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .in("status", ["sent", "confirmed", "partial"])
    .order("order_date", { ascending: false })
    .limit(20);
  if (error || !data?.length) return null;
  if (data.length === 1 || total == null) {
    return { id: data[0].id, po_number: data[0].po_number };
  }
  // Mais próximo do valor da NF (tolerância 15% — frete/IPI mudam o total).
  let best: (typeof data)[number] | null = null;
  let bestDiff = Infinity;
  for (const po of data) {
    const diff = Math.abs(Number(po.total ?? 0) - total);
    if (diff < bestDiff) {
      best = po;
      bestDiff = diff;
    }
  }
  if (best && bestDiff <= Math.max(total * 0.15, 50)) {
    return { id: best.id, po_number: best.po_number };
  }
  return null;
}

async function poHasPayables(
  admin: Admin,
  tenantId: string,
  poId: string
): Promise<boolean> {
  const { count } = await admin
    .from("accounts_payable")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", poId)
    .neq("status", "cancelled");
  return (count ?? 0) > 0;
}

export async function syncInboundNfeInboxFromBling(
  admin: Admin,
  tenantId: string,
  opts?: { days?: number }
): Promise<BlingReceivedSyncResult> {
  const result: BlingReceivedSyncResult = {
    fetched: 0,
    imported: 0,
    updated: 0,
    skipped_own: 0,
    payables_created: 0,
    errors: [],
  };

  const { data: settings } = await admin
    .from("company_settings")
    .select("cnpj")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const ownCnpj = digits(settings?.cnpj);

  const days = Math.min(Math.max(opts?.days ?? 45, 1), 120);
  const since = ymd(new Date(Date.now() - days * 86_400_000));
  const rows = await listBlingEntradaSince(admin, tenantId, since);
  result.fetched = rows.length;

  const db = asUntypedAdmin(admin);

  for (const row of rows) {
    try {
      const key = digits(row.chaveAcesso);
      if (key.length !== 44) continue;
      // Posições 7–20 da chave = CNPJ do emitente.
      if (ownCnpj && key.slice(6, 20) === ownCnpj) {
        result.skipped_own += 1;
        continue;
      }

      const { data: existing } = await db
        .from("inbound_nfe_inbox")
        .select("id, json_payload, xml_content, status")
        .eq("tenant_id", tenantId)
        .eq("access_key", key)
        .maybeSingle();
      const prevMeta = (existing as { json_payload?: Partial<BlingInboxMeta> } | null)
        ?.json_payload;
      if (prevMeta?.source === "bling" && (existing as { xml_content?: string })?.xml_content) {
        // Já processada com XML: nada a fazer.
        continue;
      }

      const detailRes = await blingGet<{ data?: BlingNfeDetail }>(
        admin,
        tenantId,
        `/nfe/${row.id}`
      );
      const nf = detailRes?.data ?? (row as BlingNfeDetail);

      let xml: string | null = null;
      if (typeof nf.xml === "string" && /^https?:\/\//.test(nf.xml)) {
        try {
          const text = await blingFetchText(admin, tenantId, nf.xml);
          if (text.includes("<infNFe") || text.includes("<nfeProc")) xml = text;
        } catch {
          /* XML é opcional */
        }
      }

      const issuerDoc = digits(nf.contato?.numeroDocumento) || key.slice(6, 20);
      const issuerName = nf.contato?.nome ?? null;
      const total = Number.isFinite(Number(nf.valorNota)) ? Number(nf.valorNota) : null;
      const issueDate = (nf.dataEmissao ?? "").slice(0, 10) || null;
      const parcelas = (nf.parcelas ?? [])
        .map((p) => ({ data: String(p.data ?? "").slice(0, 10), valor: Number(p.valor ?? 0) }))
        .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.data) && p.valor > 0);

      const { supplier } = await findSupplierByDocument(admin, tenantId, issuerDoc);
      const supplierId = supplier?.id ?? null;
      const suggestedPo = supplierId
        ? await suggestOpenPurchaseOrder(admin, tenantId, supplierId, total)
        : null;

      // Contas a pagar: só quando não existe PC com parcelas (evita duplicar a previsão do PC).
      let payableIds = prevMeta?.payable_ids ?? [];
      let payablesNote = prevMeta?.payables_note ?? "";
      if (!payableIds.length) {
        const poCovers = suggestedPo
          ? await poHasPayables(admin, tenantId, suggestedPo.id)
          : false;
        if (poCovers) {
          payablesNote = `PC ${suggestedPo!.po_number} já tem parcelas — conferir vencimento com a NF`;
        } else if (!parcelas.length) {
          payablesNote = "NF sem parcelas no Bling — lançar manualmente";
        } else {
          const n = parcelas.length;
          const label = `NF ${nf.numero ?? key.slice(25, 34)} — ${issuerName ?? issuerDoc}`;
          const insertRows = parcelas.map((p, i) => ({
            tenant_id: tenantId,
            description: n > 1 ? `${label} — parcela ${i + 1}/${n}` : label,
            category: "Fornecedor",
            supplier_id: supplierId,
            original_amount: p.valor,
            current_amount: p.valor,
            due_date: p.data,
            status: "pending",
            source_kind: "manual",
            amount_locked: false,
            is_forecast: false,
            notes: `NF-e de entrada (Bling) — chave ${key}${suggestedPo ? ` — PC sugerido ${suggestedPo.po_number}` : ""}`,
          }));
          const { data: created, error: apErr } = await admin
            .from("accounts_payable")
            .insert(insertRows as never)
            .select("id");
          if (apErr) {
            payablesNote = `Erro ao lançar contas a pagar: ${apErr.message}`;
          } else {
            payableIds = (created ?? []).map((r: { id: string }) => r.id);
            result.payables_created += payableIds.length;
            payablesNote = `${payableIds.length} parcela(s) lançada(s) em contas a pagar`;
          }
        }
      }

      const meta: BlingInboxMeta = {
        source: "bling",
        bling_id: row.id,
        numero: nf.numero ?? null,
        serie: nf.serie != null ? String(nf.serie) : null,
        link_danfe: nf.linkDanfe ?? null,
        parcelas,
        supplier_id: supplierId,
        suggested_po: suggestedPo,
        payable_ids: payableIds,
        payables_note: payablesNote,
        synced_at: new Date().toISOString(),
      };

      const { error: upErr } = await db.from("inbound_nfe_inbox").upsert(
        {
          tenant_id: tenantId,
          access_key: key,
          issuer_name: issuerName,
          issuer_document: issuerDoc,
          issue_date: issueDate,
          total_amount: total,
          xml_content: xml ?? (existing as { xml_content?: string } | null)?.xml_content ?? null,
          json_payload: meta,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,access_key", ignoreDuplicates: false }
      );
      if (upErr) {
        result.errors.push(`${key.slice(-8)}: ${upErr.message}`);
        continue;
      }
      if (existing) result.updated += 1;
      else result.imported += 1;
    } catch (e) {
      result.errors.push(
        `${String(row.numero ?? row.id)}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return result;
}
