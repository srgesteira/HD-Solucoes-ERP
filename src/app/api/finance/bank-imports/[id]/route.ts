import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { autoMatchBankImport } from "@/modules/finance/lib/bank-reconciliation-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("finance");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("bank_statement_lines")
    .select(
      `
      id,
      transaction_date,
      amount,
      description,
      document_number,
      match_status,
      matched_receivable_id,
      matched_payable_id,
      matched_receivable:receivables!bank_statement_lines_matched_receivable_id_fkey(
        id, client_name, document_number, current_amount
      ),
      matched_payable:accounts_payable!bank_statement_lines_matched_payable_id_fkey(
        id, description, current_amount
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("bank_import_id", id)
    .order("transaction_date", { ascending: false });

  if (error) return apiError(error.message, 500);
  return apiOk({ items: data ?? [] });
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("finance");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const { data: imp } = await db
    .from("bank_imports")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!imp) return apiError("Importação não encontrada", 404);

  try {
    const result = await autoMatchBankImport(admin, tenantId, id);
    return apiOk(result);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no match", 500);
  }
}
