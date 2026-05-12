import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/auth/callback",
  "/reset-password",
  "/update-password",
  "/privacy",
]);

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
        /*
         * Não usar request.cookies.set — no middleware do Next isto pode lançar
         * ("Cookies... cannot be mutated") e dá 500 em todas as páginas.
         * Actualizar apenas a NextResponse é o fluxo oficial do Supabase SSR.
         */
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

  if (user && pathname === "/login") {
    return NextResponse.redirect(`${origin}/boards`);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Excluímos /api/*: cada Route Handler já faz getUser via createServerSupabaseClient.
     * Manter middleware nas APIs duplicava lógica e, em cenários Edge, podia contribuir para
     * pedidos lentos ou aparentarem “pending” indefinido no navegador.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
