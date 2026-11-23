import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — pública (para o UptimeRobot monitorar o próprio ERP).
 * 200 se o servidor responde e o banco atende uma consulta simples; 503 se o banco não responde.
 */
export async function GET() {
  const inicio = Date.now();
  let banco = "ok";
  try {
    const { error } = await createSupabaseAdminClient().from("tenants").select("id", { head: true, count: "exact" }).limit(1);
    if (error) banco = "erro";
  } catch {
    banco = "erro";
  }
  const ok = banco === "ok";
  return NextResponse.json(
    {
      ok,
      banco,
      ms: Date.now() - inicio,
      versao: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
      em: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
