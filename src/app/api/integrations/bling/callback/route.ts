import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { completeBlingOAuth, consumeBlingOAuthState } from "@/modules/fiscal/lib/bling/bling-oauth";
import { blingAppUrl } from "@/modules/fiscal/lib/bling/bling-env";

export const dynamic = "force-dynamic";

function redirectToCompany(query: Record<string, string>): NextResponse {
  const url = new URL("/settings/company", blingAppUrl());
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const errorParam = request.nextUrl.searchParams.get("error");
  if (errorParam) {
    return redirectToCompany({
      bling: "error",
      reason: errorParam,
    });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = request.nextUrl.searchParams.get("state")?.trim() ?? "";
  if (!code || !state) {
    return redirectToCompany({
      bling: "error",
      reason: "callback_invalido",
    });
  }

  const admin = createSupabaseAdminClient();
  try {
    const consumed = await consumeBlingOAuthState(admin, state);
    if (!consumed) {
      return redirectToCompany({
        bling: "error",
        reason: "state_invalido",
      });
    }
    await completeBlingOAuth(admin, consumed.tenant_id, code);
    return redirectToCompany({ bling: "connected" });
  } catch (e) {
    const reason =
      e instanceof Error ? e.message.slice(0, 180) : "oauth_falhou";
    return redirectToCompany({ bling: "error", reason });
  }
}
