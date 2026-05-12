import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import type { SalesGoalRow } from "@/lib/types/sales.types";

export const dynamic = "force-dynamic";

type GoalJoined = SalesGoalRow & {
  user: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

function pct(goal: SalesGoalRow): number | null {
  if (goal.goal_amount <= 0) return null;
  return Math.round((goal.achieved_amount / goal.goal_amount) * 10000) / 100;
}

function mapGoal(row: GoalJoined | SalesGoalRow) {
  return {
    ...row,
    progress_percent: pct(row),
  };
}

const LIST_DETAIL_SELECT = `
  *,
  user:user_profiles!sales_goals_user_profile_id_fkey(id, full_name, email)
`.trim();

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const searchParams = request.nextUrl.searchParams;
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const user_profile_id = searchParams.get("user_profile_id")?.trim();

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("sales_goals")
    .select(LIST_DETAIL_SELECT);

  query = query.eq("tenant_id", tenantId);

  if (year) {
    const y = parseInt(year, 10);
    if (!Number.isFinite(y)) return apiError("Ano inválido", 400);
    query = query.eq("year", y);
  }
  if (month) {
    const m = parseInt(month, 10);
    if (!Number.isFinite(m) || m < 1 || m > 12)
      return apiError("Mês inválido", 400);
    query = query.eq("month", m);
  }
  if (user_profile_id) {
    query = query.eq("user_profile_id", user_profile_id);
  }

  const { data, error } = await query
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(500);

  if (error) {
    return apiError(
      "Erro ao listar metas: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const rows = (data ?? []) as unknown as GoalJoined[];
  return apiOk({
    data: rows.map(mapGoal),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const admin = createSupabaseAdminClient();

  const yr =
    typeof b.year === "number" ? b.year : parseInt(String(b.year ?? ""), 10);
  const mn =
    typeof b.month === "number" ? b.month : parseInt(String(b.month ?? ""), 10);

  if (!Number.isFinite(yr)) return apiError("Ano obrigatório", 400);
  if (!Number.isFinite(mn) || mn < 1 || mn > 12)
    return apiError("Mês inválido (1–12)", 400);

  const goalAmt =
    typeof b.goal_amount === "number"
      ? b.goal_amount
      : parseFloat(String(b.goal_amount));

  if (!Number.isFinite(goalAmt) || goalAmt <= 0) {
    return apiError("Meta (valor) inválida", 400);
  }

  const achieved =
    b.achieved_amount === undefined || b.achieved_amount === null
      ? 0
      : typeof b.achieved_amount === "number"
        ? b.achieved_amount
        : parseFloat(String(b.achieved_amount));

  if (!Number.isFinite(achieved) || achieved < 0) {
    return apiError("Valor realizado inválido", 400);
  }

  const profileId =
    b.user_profile_id === undefined || b.user_profile_id === null
      ? null
      : String(b.user_profile_id);

  if (profileId) {
    const { data: prof } = await admin
      .from("user_profiles")
      .select("id")
      .eq("id", profileId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!prof) return apiError("Perfil / vendedor inválido", 400);
  }

  const notes =
    b.notes === undefined || b.notes === null
      ? null
      : String(b.notes).trim() || null;

  const { data: row, error } = await admin
    .from("sales_goals")
    .insert({
      tenant_id: tenantId,
      year: yr,
      month: mn,
      user_profile_id: profileId,
      goal_amount: goalAmt,
      achieved_amount: achieved,
      notes,
    })
    .select(LIST_DETAIL_SELECT)
    .single();

  if (error?.code === "23505") {
    return apiError("Meta já existe para período/vendedor", 409);
  }
  if (error) {
    return apiError(
      "Erro ao criar meta: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: mapGoal(row as unknown as GoalJoined) }, 201);
}
