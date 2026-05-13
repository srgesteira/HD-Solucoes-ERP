import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * Exportação agregada dos dados do tenant (LGPD / portabilidade).
 * Pode ser pesada em tenants muito grandes.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem exportar dados.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const tenant = tenantId;
  const admin = createSupabaseAdminClient();

  async function allRows(table: keyof Database["public"]["Tables"]) {
    const client = admin as unknown as {
      from: (t: keyof Database["public"]["Tables"]) => {
        select: (q: string) => {
          eq: (
            c: string,
            v: string
          ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("tenant_id", tenant);
    if (error) {
      throw new Error(`${String(table)}: ${error.message}`);
    }
    return data ?? [];
  }

  try {
    const [
      company_settings,
      bdi_settings,
      user_profiles,
      products,
      product_families,
      product_subfamilies,
      suppliers,
      purchase_orders,
      quotes,
      sales_orders,
      receivables,
      work_areas,
      work_centers,
      production_lines,
      production_orders,
      boards,
      privacy_consents,
      accounts_payable,
      cash_flow_entries,
      employees,
    ] = await Promise.all([
      allRows("company_settings"),
      allRows("bdi_settings"),
      allRows("user_profiles"),
      allRows("products"),
      allRows("product_families"),
      allRows("product_subfamilies"),
      allRows("suppliers"),
      allRows("purchase_orders"),
      allRows("quotes"),
      allRows("sales_orders"),
      allRows("receivables"),
      allRows("work_areas"),
      allRows("work_centers"),
      allRows("production_lines"),
      allRows("production_orders"),
      allRows("boards"),
      allRows("privacy_consents").catch(() => []),
      allRows("accounts_payable"),
      allRows("cash_flow_entries"),
      allRows("employees"),
    ]);

    const purchaseIds = (purchase_orders as { id: string }[]).map((p) => p.id);
    const quoteIds = (quotes as { id: string }[]).map((p) => p.id);
    const salesIds = (sales_orders as { id: string }[]).map((p) => p.id);
    const boardIds = (boards as { id: string }[]).map((p) => p.id);

    const [poiRes, qiRes, soiRes, tasksRes] = await Promise.all([
      purchaseIds.length ?
        admin.from("purchase_order_items").select("*").in("purchase_order_id", purchaseIds)
      : { data: [], error: null },
      quoteIds.length ?
        admin.from("quote_items").select("*").in("quote_id", quoteIds)
      : { data: [], error: null },
      salesIds.length ?
        admin.from("sales_order_items").select("*").in("sales_order_id", salesIds)
      : { data: [], error: null },
      boardIds.length ?
        admin.from("tasks").select("*").in("board_id", boardIds)
      : { data: [], error: null },
    ]);

    for (const r of [poiRes, qiRes, soiRes, tasksRes]) {
      if (r.error) {
        throw new Error(r.error.message);
      }
    }

    const payload = {
      exported_at: new Date().toISOString(),
      tenant_id: tenant,
      company_settings,
      bdi_settings,
      user_profiles,
      products,
      product_families,
      product_subfamilies,
      suppliers,
      purchase_orders,
      purchase_order_items: poiRes.data ?? [],
      quotes,
      quote_items: qiRes.data ?? [],
      sales_orders,
      sales_order_items: soiRes.data ?? [],
      receivables,
      work_areas,
      work_centers,
      production_lines,
      production_orders,
      boards,
      tasks: tasksRes.data ?? [],
      privacy_consents,
      accounts_payable,
      cash_flow_entries,
      employees,
    };

    const body = JSON.stringify(payload, null, 2);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-tenant-${tenantId}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na exportação";
    return apiError(msg, 500);
  }
}
