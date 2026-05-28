import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError } from "@/modules/core/lib/http";
import type { NextResponse } from "next/server";
import { currentUserCanMenuModule } from "@/modules/core/lib/tenant";

/**
 * Acesso por chave PT do menu (`enabled_modules`).
 */
export async function assertMenuModuleAccess(
  menuKey: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("Não autenticado", 401) };
  }

  if (!(await currentUserCanMenuModule(menuKey))) {
    return { ok: false, response: apiError("Sem permissão", 403) };
  }

  return { ok: true };
}

/** Relatórios financeiros: módulo faturamento (inclui reports no bridge legado). */
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

  if (await currentUserCanMenuModule("faturamento")) {
    return { ok: true };
  }

  return {
    ok: false,
    response: apiError("Sem acesso a relatórios financeiros", 403),
  };
}

/** Produção ou faturamento (relatórios). */
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
    (await currentUserCanMenuModule("producao")) ||
    (await currentUserCanMenuModule("faturamento"))
  ) {
    return { ok: true };
  }

  return { ok: false, response: apiError("Sem permissão", 403) };
}

/** Vendas ou faturamento (relatórios). */
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
    (await currentUserCanMenuModule("vendas")) ||
    (await currentUserCanMenuModule("faturamento"))
  ) {
    return { ok: true };
  }

  return { ok: false, response: apiError("Sem permissão", 403) };
}

/** Vendas ou compras (consulta CNPJ/CPF). */
export async function assertSalesOrPurchasingAccess(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const sales = await assertMenuModuleAccess("vendas");
  if (sales.ok) return sales;
  return assertMenuModuleAccess("compras");
}
