import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set<string>(["/login", "/auth/callback"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith("/login/");
}

export async function middleware(request: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const origin = request.nextUrl.origin;
  const pathname = request.nextUrl.pathname;

  /** Sem Supabase configurado: deixe a UI mostrar a tela de login com o aviso. */
  const supabaseConfigured =
    (url.startsWith("http://") || url.startsWith("https://")) && !!anonKey;

  if (!supabaseConfigured) {
    if (isPublicPath(pathname)) {
      return NextResponse.next({ request });
    }
    return NextResponse.redirect(`${origin}/login`);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (user && pathname.startsWith("/login")) {
    return NextResponse.redirect(`${origin}/boards`);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
