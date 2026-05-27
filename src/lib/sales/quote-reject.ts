import type { AdminClient } from "@/lib/sales/sales-flow";
import { asUntypedAdmin } from "@/lib/supabase/untyped-tables";

export type RejectQuoteInput = {
  reason_ids: string[];
  notes?: string | null;
};

export type RejectQuoteResult =
  | { ok: true }
  | { ok: false; message: string; status: number };

export async function rejectQuoteWithReasons(
  admin: AdminClient,
  tenantId: string,
  quoteId: string,
  input: RejectQuoteInput
): Promise<RejectQuoteResult> {
  const reasonIds = [...new Set(input.reason_ids.filter(Boolean))];
  if (!reasonIds.length) {
    return {
      ok: false,
      message: "Selecione pelo menos um motivo de rejeição",
      status: 400,
    };
  }

  const { data: quote } = await admin
    .from("quotes")
    .select("id, status")
    .eq("id", quoteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!quote) {
    return { ok: false, message: "Orçamento não encontrado", status: 404 };
  }

  if (quote.status === "converted") {
    return {
      ok: false,
      message: "Orçamento convertido não pode ser rejeitado",
      status: 400,
    };
  }

  const db = asUntypedAdmin(admin);
  const { data: reasons, error: rErr } = await db
    .from("rejection_reasons")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("id", reasonIds);

  if (rErr) {
    return {
      ok: false,
      message: "Erro ao validar motivos: " + rErr.message,
      status: 500,
    };
  }

  if ((reasons ?? []).length !== reasonIds.length) {
    return { ok: false, message: "Motivo de rejeição inválido", status: 400 };
  }

  const notes =
    input.notes === undefined || input.notes === null
      ? null
      : String(input.notes).trim() || null;

  await db
    .from("quote_rejections")
    .delete()
    .eq("quote_id", quoteId)
    .eq("tenant_id", tenantId);

  const rows = reasonIds.map((rejection_reason_id) => ({
    tenant_id: tenantId,
    quote_id: quoteId,
    rejection_reason_id,
    notes,
  }));

  const { error: insErr } = await db.from("quote_rejections").insert(rows);
  if (insErr) {
    return {
      ok: false,
      message: "Erro ao registar rejeição: " + insErr.message,
      status: 500,
    };
  }

  const { error: uErr } = await admin
    .from("quotes")
    .update({ status: "rejected", revision_notes: null })
    .eq("id", quoteId)
    .eq("tenant_id", tenantId);

  if (uErr) {
    return {
      ok: false,
      message: "Erro ao atualizar orçamento: " + uErr.message,
      status: 500,
    };
  }

  return { ok: true };
}
