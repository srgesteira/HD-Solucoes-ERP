import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem enviar o logótipo.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Formulário inválido", 400);
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return apiError("Ficheiro em falta ou vazio.", 400);
  }

  if (file.size > MAX_BYTES) {
    return apiError("Imagem demasiado grande (máx. 5 MB).", 400);
  }

  const type = file.type || "";
  if (!ALLOWED.has(type)) {
    return apiError("Formato não suportado. Use JPEG, PNG, WebP ou GIF.", 400);
  }

  const ext =
    type === "image/png" ? "png"
    : type === "image/webp" ? "webp"
    : type === "image/gif" ? "gif"
    : "jpg";

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${tenantId}/logo-${Date.now()}.${ext}`;

  const admin = createSupabaseAdminClient();
  const { error: upErr } = await admin.storage
    .from("company-logos")
    .upload(path, buffer, {
      contentType: type,
      upsert: false,
    });

  if (upErr) {
    console.error("[upload-logo]", upErr);
    return apiError(
      "Erro ao enviar imagem: " + upErr.message,
      supabaseErrorToHttp(null)
    );
  }

  const { data: pub } = admin.storage.from("company-logos").getPublicUrl(path);
  const logo_url = pub?.publicUrl;
  if (!logo_url) {
    return apiError("Não foi possível obter o URL público.", 500);
  }

  return apiOk({ logo_url });
}
