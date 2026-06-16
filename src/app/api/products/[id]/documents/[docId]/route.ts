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

type Params = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
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
    .select("id, storage_path, product_id")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar documento: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }
  if (!doc) return apiError("Documento não encontrado", 404);

  if (!storagePathBelongsToTenant(doc.storage_path, tenantId)) {
    return apiError("Path de storage inválido para este tenant.", 403);
  }

  const { error: delRowErr } = await admin
    .from("product_documents")
    .delete()
    .eq("id", docId)
    .eq("tenant_id", tenantId);

  if (delRowErr) {
    return apiError(
      "Erro ao remover documento: " + delRowErr.message,
      supabaseErrorToHttp(delRowErr.code)
    );
  }

  const { error: delFileErr } = await admin.storage
    .from(PRODUCT_DOCUMENT_BUCKET)
    .remove([doc.storage_path]);

  if (delFileErr) {
    console.error("[product-documents delete storage]", delFileErr);
  }

  return apiOk({ deleted: true });
}
