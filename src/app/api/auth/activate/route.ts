import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { syncInviteProfileFromUser } from "@/shared/auth/sync-invite-profile";

export const dynamic = "force-dynamic";

const ALLOWED_OTP_TYPES = new Set<string>([
  "invite",
  "recovery",
  "signup",
  "magiclink",
]);

/**
 * Consome o token de convite apenas em POST (clique do utilizador).
 * Evita que pré-visualizações (Slack, WhatsApp, etc.) gastem o link no GET.
 */
export async function POST(request: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const { origin } = new URL(request.url);

  let token_hash = "";
  let type = "invite";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        token_hash?: string;
        type?: string;
      };
      token_hash = String(body.token_hash ?? "").trim();
      type = String(body.type ?? "invite").trim();
    } catch {
      return NextResponse.redirect(`${origin}/login?error=activate`);
    }
  } else {
    const form = await request.formData();
    token_hash = String(form.get("token_hash") ?? "").trim();
    type = String(form.get("type") ?? "invite").trim();
  }

  if (!token_hash || !url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=activate`);
  }
  if (!ALLOWED_OTP_TYPES.has(type)) {
    return NextResponse.redirect(`${origin}/login?error=activate`);
  }

  const response = NextResponse.redirect(`${origin}/set-password`);

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as EmailOtpType,
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=activate`);
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await syncInviteProfileFromUser(user);
  } catch {
    // não bloquear ativação
  }

  return response;
}

