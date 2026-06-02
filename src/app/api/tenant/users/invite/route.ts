import type { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { buildInviteActivationLink } from "@/shared/auth/activation-link";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  admin_all: z.boolean().optional(),
  enabled_modules: z.array(z.string()).optional(),
  role_key: z.string().trim().optional(),
  full_name: z.string().trim().optional(),
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
    return apiError("Apenas administradores podem convidar utilizadores.", 403);
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
  // redirectTo sem query string — deve constar na allow list do Supabase (fallback PKCE).
  const redirectTo = `${origin}/auth/callback`;

  const admin_all = parsed.data.admin_all === true;
  const enabled_modules = admin_all ? ["*"] : (parsed.data.enabled_modules ?? []);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
    options: {
      redirectTo,
      data: {
        tenant_id: tenantId,
        admin_all,
        enabled_modules,
        role_key: parsed.data.role_key ?? null,
        full_name: parsed.data.full_name ?? null,
        must_set_password: true,
      },
    },
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !data?.user || !hashedToken) {
    return apiError(error?.message ?? "Erro ao convidar.", 400);
  }

  // Garante perfil no tenant com permissões (o usuário ativa depois definindo a senha).
  const uid = data.user.id;
  const email = data.user.email ?? parsed.data.email;
  await admin
    .from("user_profiles")
    .upsert(
      {
        id: uid,
        tenant_id: tenantId,
        email,
        full_name: parsed.data.full_name ?? null,
        role: "user",
        is_active: true,
        enabled_modules,
        role_keys: parsed.data.role_key ? [parsed.data.role_key] : [],
      },
      { onConflict: "id" }
    );

  return apiOk({
    user: { id: uid, email },
    activation_link: buildInviteActivationLink(origin, hashedToken),
  });
}

