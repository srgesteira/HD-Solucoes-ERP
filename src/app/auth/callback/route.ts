import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/modules/core/types/database";
import { syncInviteProfileFromUser } from "@/shared/auth/sync-invite-profile";

export const dynamic = "force-dynamic";

function resolvePostAuthPath(
  user: { user_metadata?: Record<string, unknown>; invited_at?: string | null },
  nextParam: string | null
): string {
  if (nextParam) return nextParam;
  const md = user.user_metadata ?? {};
  if (md.must_set_password === true || user.invited_at) {
    return "/set-password";
  }
  return "/dashboard";
}

/**
 * Troca o `code` PKCE do Supabase (login, recovery, etc.) por sessão em cookie.
 */
export async function GET(request: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (!code || !url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const cookieHolder = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieHolder.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  let destination = nextParam ?? "/dashboard";
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await syncInviteProfileFromUser(user);
      destination = resolvePostAuthPath(user, nextParam);
    }
  } catch {
    // não bloquear login por falha de sync
  }

  const response = NextResponse.redirect(`${origin}${destination}`);
  cookieHolder.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
