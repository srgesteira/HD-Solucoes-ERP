import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  PRODUCT_DOCUMENT_BUCKET,
  storagePathBelongsToTenant,
} from "@/modules/engenharia/lib/products/product-documents";

export const dynamic = "force-dynamic";

const SIGNED_URL_SECONDS = 180;

type Params = { params: Promise<{ id: string; docId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId, docId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: doc, error: loadErr } = await admin
    .from("product_documents")
    .select("id, storage_path, file_name, mime_type, product_id")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar documento: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }
  if (!doc) return apiError("Documento não encontrado", 404);

  if (!storagePathBelongsToTenant(doc.storage_path, tenantId)) {
    return apiError("Acesso negado ao ficheiro.", 403);
  }

  const pathParts = doc.storage_path.split("/");
  if (pathParts[2] !== productId) {
    return apiError("Documento não pertence a este produto.", 403);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(PRODUCT_DOCUMENT_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return apiError(
      "Erro ao gerar link de download: " + (signErr?.message ?? "desconhecido"),
      500
    );
  }

  return apiOk({
    url: signed.signedUrl,
    expires_in: SIGNED_URL_SECONDS,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
  });
}
