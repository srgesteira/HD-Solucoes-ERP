import { NextResponse } from "next/server";

/** Resposta JSON padronizada para erros de API, em português. */
export function apiError(
  message: string,
  status: number,
  detail?: unknown
): NextResponse {
  return NextResponse.json(
    { error: message, ...(detail !== undefined ? { detail } : {}) },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

/** Resposta JSON sucesso com `Cache-Control: no-store`. */
export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Mapeia erro do Supabase/PostgREST para HTTP status razoável. */
export function supabaseErrorToHttp(code: string | null | undefined): number {
  switch (code) {
    case "23505":
      return 409;
    case "23503":
    case "23502":
      return 400;
    case "42501":
    case "PGRST301":
      return 403;
    default:
      return 500;
  }
}
