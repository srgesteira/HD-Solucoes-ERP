import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError } from "@/modules/core/lib/http";
import type { ModuleKey } from "@/shared/auth/permissions";
import type { NextResponse } from "next/server";
import { currentUserCanModule } from "@/modules/core/lib/tenant";

/**
 * Acesso a um módulo (admin, enabled_modules ou JSON legado `permissions`).
 */
export async function assertModuleAccess(
  module: ModuleKey
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("Não autenticado", 401) };
  }

  if (!(await currentUserCanModule(module))) {
    return { ok: false, response: apiError("Sem acesso a este módulo", 403) };
  }

  return { ok: true };
}

/** Relatórios financeiros: Financeiro ou Relatórios (legado). */
export async function assertFinanceOrReportsAccess(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("Não autenticado", 401) };
  }

  if (
    (await currentUserCanModule("finance")) ||
    (await currentUserCanModule("reports"))
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    response: apiError("Sem acesso a relatórios financeiros", 403),
  };
}

/** Produção ou Relatórios (legado). */
export async function assertProductionOrReportsAccess(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("Não autenticado", 401) };
  }

  if (
    (await currentUserCanModule("production")) ||
    (await currentUserCanModule("reports"))
  ) {
    return { ok: true };
  }

  return { ok: false, response: apiError("Sem acesso", 403) };
}

/** Vendas ou Relatórios (legado). */
export async function assertSalesOrReportsAccess(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("Não autenticado", 401) };
  }

  if (
    (await currentUserCanModule("sales")) ||
    (await currentUserCanModule("reports"))
  ) {
    return { ok: true };
  }

  return { ok: false, response: apiError("Sem acesso", 403) };
}

/** Vendas ou Compras (consulta CNPJ/CPF). */
export async function assertSalesOrPurchasingAccess(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const sales = await assertModuleAccess("sales");
  if (sales.ok) return sales;
  return assertModuleAccess("purchasing");
}
