import type { NextResponse } from "next/server";
import { apiError } from "@/modules/core/lib/http";
import { currentUserCanMenuModule } from "@/modules/core/lib/tenant";

/** Bloqueia a rota se o utilizador não tiver o módulo PT; devolve `NextResponse` 403 ou `null`. */
export async function requireMenuModule(
  menuKey: string
): Promise<NextResponse | null> {
  if (!(await currentUserCanMenuModule(menuKey))) {
    return apiError("Sem permissão", 403);
  }
  return null;
}
