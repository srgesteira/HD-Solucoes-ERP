import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiOk } from "@/modules/core/lib/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/status/n8n — pública (para o UptimeRobot).
 * 200 se o n8n mandou heartbeat há menos de 25 min; 503 se não (ou se nunca mandou).
 * Não devolve nada sensível: só a hora do último sinal e há quantos minutos foi.
 */
const LIMITE_MIN = 25;

function indisponivel(motivo: string, ultimo: string | null, minutos: number | null) {
  return NextResponse.json(
    { ok: false, motivo, ultimo_sinal: ultimo, minutos_desde_ultimo: minutos, limite_min: LIMITE_MIN },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  const { data, error } = await asUntypedAdmin(createSupabaseAdminClient())
    .from("robot_heartbeats")
    .select("last_seen_at")
    .eq("robot", "n8n")
    .maybeSingle();
  if (error) return indisponivel("Erro ao ler o heartbeat.", null, null);
  const ultimo: string | null = data?.last_seen_at ?? null;
  if (!ultimo) return indisponivel("O n8n ainda não mandou nenhum sinal.", null, null);

  const minutos = Math.floor((Date.now() - new Date(ultimo).getTime()) / 60000);
  if (minutos >= LIMITE_MIN) return indisponivel(`Sem sinal do n8n há ${minutos} min.`, ultimo, minutos);
  return apiOk({ ok: true, ultimo_sinal: ultimo, minutos_desde_ultimo: minutos, limite_min: LIMITE_MIN });
}
