import type { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { buildInviteActivationLink } from "@/shared/auth/activation-link";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  user_id: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

function appOriginFromRequest(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem reenviar convite.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError("Dados inválidos", 400);

  const admin = createSupabaseAdminClient();
  const origin = appOriginFromRequest(request);
  const redirectTo = `${origin}/auth/callback`;

  const emailParam = parsed.data.email?.trim() || null;
  const userIdParam = parsed.data.user_id?.trim() || null;

  // Carrega permissões atuais do perfil para gerar link consistente
  let q = admin
    .from("user_profiles")
    .select("id, tenant_id, enabled_modules, role_keys, full_name, email")
    .eq("tenant_id", tenantId);
  if (userIdParam) q = q.eq("id", userIdParam);
  else if (emailParam) q = q.ilike("email", emailParam);
  else return apiError("Informe user_id ou email.", 400);

  const { data: profile } = await q.maybeSingle();
  if (!profile) return apiError("Utilizador não encontrado neste tenant.", 404);

  const role_key =
    profile?.role_keys && profile.role_keys.length > 0 ? profile.role_keys[0] : null;
  const enabled_modules = profile?.enabled_modules ?? [];
  const admin_all = enabled_modules.includes("*");
  const email = profile.email;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo,
      data: {
        tenant_id: tenantId,
        admin_all,
        enabled_modules,
        role_key,
        full_name: profile?.full_name ?? null,
        must_set_password: true,
      },
    },
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) return apiError(error?.message ?? "Erro", 400);
  return apiOk({
    user: { id: data?.user?.id ?? profile.id, email },
    activation_link: buildInviteActivationLink(origin, hashedToken),
  });
}

