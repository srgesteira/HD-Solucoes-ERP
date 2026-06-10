import type { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { generateActivationLinkForEmail } from "@/shared/auth/generate-activation-link";

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
    .select("id, tenant_id, role, enabled_modules, role_keys, full_name, email")
    .eq("tenant_id", tenantId);
  if (userIdParam) q = q.eq("id", userIdParam);
  else if (emailParam) q = q.ilike("email", emailParam);
  else return apiError("Informe user_id ou email.", 400);

  const { data: profile } = await q.maybeSingle();
  if (!profile) return apiError("Utilizador não encontrado neste tenant.", 404);

  const role_key =
    profile?.role_keys && profile.role_keys.length > 0 ? profile.role_keys[0] : null;
  const enabled_modules = profile?.enabled_modules ?? [];
  const admin_all =
    profile.role === "admin" || enabled_modules.includes("*");
  const email = profile.email;

  try {
    const { activation_link, link_type } = await generateActivationLinkForEmail(
      admin,
      {
        email,
        origin,
        redirectTo,
        metadata: {
          tenant_id: tenantId,
          admin_all,
          enabled_modules,
          role_key,
          full_name: profile?.full_name ?? null,
          must_set_password: true,
        },
      }
    );
    return apiOk({
      user: { id: profile.id, email },
      activation_link,
      link_type,
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro", 400);
  }
}

