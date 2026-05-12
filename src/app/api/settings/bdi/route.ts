import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { bdiSettingsUpdateSchema } from "@/lib/schemas/bdi.schema";
import type { Database } from "@/lib/types/database";
import { defaultBdiSettings } from "@/lib/pricing/bdi-calculate";
import { bdiRowToSlice } from "@/lib/pricing/bdi-db";

export const dynamic = "force-dynamic";

function defaultsForInsert(
  tenantId: string
): Database["public"]["Tables"]["bdi_settings"]["Insert"] {
  const d = defaultBdiSettings();
  return {
    tenant_id: tenantId,
    tax_icms: d.tax_icms,
    tax_pis: d.tax_pis,
    tax_cofins: d.tax_cofins,
    tax_ipi: d.tax_ipi,
    tax_iss: d.tax_iss,
    admin_overhead: d.admin_overhead,
    commercial_overhead: d.commercial_overhead,
    financial_overhead: d.financial_overhead,
    profit_margin: d.profit_margin,
    use_compound_bdi: d.use_compound_bdi,
    min_markup: d.min_markup,
    max_markup: d.max_markup,
  };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("bdi_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao carregar BDI: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data,
    slice: bdiRowToSlice(data),
  });
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = bdiSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data: existing, error: exErr } = await admin
    .from("bdi_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (exErr) {
    return apiError(
      "Erro ao carregar BDI: " + exErr.message,
      supabaseErrorToHttp(exErr.code)
    );
  }

  const dflt = defaultsForInsert(tenantId);

  const row: Database["public"]["Tables"]["bdi_settings"]["Insert"] = {
    tenant_id: tenantId,
    tax_icms:
      b.tax_icms !== undefined
        ? b.tax_icms
        : Number(existing?.tax_icms ?? dflt.tax_icms),
    tax_pis:
      b.tax_pis !== undefined
        ? b.tax_pis
        : Number(existing?.tax_pis ?? dflt.tax_pis),
    tax_cofins:
      b.tax_cofins !== undefined
        ? b.tax_cofins
        : Number(existing?.tax_cofins ?? dflt.tax_cofins),
    tax_ipi:
      b.tax_ipi !== undefined
        ? b.tax_ipi
        : Number(existing?.tax_ipi ?? dflt.tax_ipi),
    tax_iss:
      b.tax_iss !== undefined
        ? b.tax_iss
        : Number(existing?.tax_iss ?? dflt.tax_iss),
    admin_overhead:
      b.admin_overhead !== undefined
        ? b.admin_overhead
        : Number(existing?.admin_overhead ?? dflt.admin_overhead),
    commercial_overhead:
      b.commercial_overhead !== undefined
        ? b.commercial_overhead
        : Number(existing?.commercial_overhead ?? dflt.commercial_overhead),
    financial_overhead:
      b.financial_overhead !== undefined
        ? b.financial_overhead
        : Number(existing?.financial_overhead ?? dflt.financial_overhead),
    profit_margin:
      b.profit_margin !== undefined
        ? b.profit_margin
        : Number(existing?.profit_margin ?? dflt.profit_margin),
    use_compound_bdi:
      b.use_compound_bdi !== undefined
        ? b.use_compound_bdi
        : (existing?.use_compound_bdi ?? dflt.use_compound_bdi ?? true),
    min_markup:
      b.min_markup !== undefined
        ? b.min_markup
        : Number(existing?.min_markup ?? dflt.min_markup),
    max_markup:
      b.max_markup !== undefined
        ? b.max_markup
        : Number(existing?.max_markup ?? dflt.max_markup),
  };

  if (existing?.id) {
    const { data: updated, error } = await admin
      .from("bdi_settings")
      .update(row)
      .eq("id", existing.id)
      .eq("tenant_id", tenantId)
      .select()
      .maybeSingle();

    if (error) {
      return apiError(
        "Erro ao actualizar BDI: " + error.message,
        supabaseErrorToHttp(error.code)
      );
    }
    return apiOk({ data: updated, slice: bdiRowToSlice(updated) });
  }

  const { data: inserted, error } = await admin
    .from("bdi_settings")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao criar BDI: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: inserted, slice: bdiRowToSlice(inserted) });
}
