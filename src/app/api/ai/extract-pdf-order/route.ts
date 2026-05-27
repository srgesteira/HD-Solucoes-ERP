import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { extractOrderFromPDF } from "@/modules/engenharia/lib/services/ai.service";

export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem extrair pedidos de PDF.", 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("FormData inválido", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError("Campo de ficheiro \"file\" é obrigatório.", 400);
  }
  if (file.size <= 0) return apiError("Ficheiro vazio.", 400);
  if (file.size > MAX_BYTES) {
    return apiError("PDF demasiado grande (máx. 12 MB).", 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const extracted = await extractOrderFromPDF(buf);
    return apiOk({ data: extracted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na extração.";
    return apiError(msg, 400);
  }
}
