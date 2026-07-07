import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

function parseDueDay(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

function parseAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export async function GET() {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin
    .from("fixed_expenses")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("description", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar contas fixas: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!description) return apiError("Descrição é obrigatória", 400);

  const amount = parseAmount(b.amount);
  if (amount == null) return apiError("Valor inválido", 400);

  const due_day = parseDueDay(b.due_day);
  if (due_day == null) return apiError("Dia de vencimento deve ser entre 1 e 31", 400);

  const cost_center_type =
    typeof b.cost_center_type === "string" && b.cost_center_type.trim()
      ? b.cost_center_type.trim()
      : "fixed";

  const start_date =
    typeof b.start_date === "string" && b.start_date.trim()
      ? b.start_date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const end_date =
    b.end_date == null || b.end_date === ""
      ? null
      : typeof b.end_date === "string"
        ? b.end_date.slice(0, 10)
        : null;

  const is_active = b.is_active !== false;

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin
    .from("fixed_expenses")
    .insert({
      tenant_id: tenantId,
      description,
      amount,
      due_day,
      cost_center_type,
      is_active,
      start_date,
      end_date,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return apiError(
      "Erro ao criar conta fixa: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
