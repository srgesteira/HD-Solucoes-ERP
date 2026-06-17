import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { listAuditEntries } from "@/modules/core/lib/audit/audit-log";

export const dynamic = "force-dynamic";

// Mantém alinhado com o array `watched` da migration de auditoria
// (supabase/migrations/20260925140000_audit_log_reapply_triggers.sql).
const ALLOWED_TABLES = new Set([
  "quotes",
  "sales_orders",
  "sales_order_items",
  "purchase_orders",
  "purchase_order_items",
  "production_orders",
  "customers",
  "suppliers",
  "products",
  "fiscal_rules",
  "accounts_payable",
  "receivables",
  "inventory_movements",
  "sales_returns",
  "purchase_returns",
  "shipments",
]);

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const url = new URL(request.url);
  const table = url.searchParams.get("table");
  const recordId = url.searchParams.get("record_id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 100) | 0, 1),
    500
  );

  if (!table || !ALLOWED_TABLES.has(table)) {
    return apiError("Tabela inválida ou sem auditoria.", 400);
  }
  if (!recordId) {
    return apiError("record_id é obrigatório", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const entries = await listAuditEntries(admin, {
      tenantId,
      table,
      recordId,
      limit,
    });
    return apiOk({ entries });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar histórico",
      500
    );
  }
}
