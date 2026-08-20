import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { maybeCloseSalesOrderOnNfeAuthorized } from "@/modules/faturamento/lib/sales-order-billing-closure";
import type { BlingNfeSnapshot } from "@/modules/fiscal/lib/bling/bling-nfe-status";

type Admin = SupabaseClient<Database>;

export async function applyBlingNfeSnapshot(
  admin: Admin,
  tenantId: string,
  nfeId: string,
  snapshot: BlingNfeSnapshot,
  extras?: { error_message?: string | null; reconcile_needed?: boolean }
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("nfes")
    .update({
      status: snapshot.status,
      bling_nfe_id: snapshot.bling_nfe_id,
      nfe_number: snapshot.nfe_number,
      nfe_key: snapshot.nfe_key,
      xml_url: snapshot.xml_url,
      pdf_url: snapshot.pdf_url,
      error_message:
        extras?.error_message !== undefined
          ? extras.error_message
          : snapshot.error_message,
      reconcile_needed: extras?.reconcile_needed ?? false,
    })
    .eq("id", nfeId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  if (snapshot.status === "authorized") {
    await maybeCloseSalesOrderOnNfeAuthorized(admin, tenantId, nfeId);
  }
}
