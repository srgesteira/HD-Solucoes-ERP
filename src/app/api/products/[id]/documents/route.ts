import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  PRODUCT_DOCUMENT_BUCKET,
  PRODUCT_DOCUMENT_MAX_BYTES,
  assertProductDocumentMime,
  buildProductDocumentStoragePath,
  isProductDocumentKind,
  storagePathBelongsToTenant,
} from "@/modules/engenharia/lib/products/product-documents";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadProductInTenant(admin: ReturnType<typeof createSupabaseAdminClient>, tenantId: string, productId: string) {
  const { data, error } = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { error };
  if (!data) return { notFound: true as const };
  return { product: data };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

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
  const product = await loadProductInTenant(admin, tenantId, productId);
  if ("error" in product && product.error) {
    return apiError("Erro ao validar produto: " + product.error.message, 500);
  }
  if ("notFound" in product) return apiError("Produto não encontrado", 404);

  const { data, error } = await admin
    .from("product_documents")
    .select(
      "id, product_id, kind, name, revision, file_name, mime_type, file_size_bytes, uploaded_at, uploaded_by, notes, is_active"
    )
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("kind", { ascending: true })
    .order("name", { ascending: true })
    .order("revision", { ascending: false })
    .order("uploaded_at", { ascending: false });

  if (error) {
    return apiError(
      "Erro ao listar documentos: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Formulário inválido", 400);
  }

  const kindRaw = String(form.get("kind") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const revision = String(form.get("revision") ?? "A").trim() || "A";
  const notesRaw = form.get("notes");
  const notes =
    typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;
  const file = form.get("file");

  if (!isProductDocumentKind(kindRaw)) {
    return apiError("Tipo de documento inválido.", 400);
  }
  if (!name) return apiError("Nome do documento é obrigatório.", 400);
  if (!(file instanceof File) || file.size <= 0) {
    return apiError("Ficheiro em falta ou vazio.", 400);
  }
  if (file.size > PRODUCT_DOCUMENT_MAX_BYTES) {
    return apiError("Ficheiro demasiado grande (máx. 25 MB).", 400);
  }

  const mime = file.type || "application/octet-stream";
  if (!assertProductDocumentMime(mime)) {
    return apiError(
      "Formato não suportado. Use PDF, imagens, Office, texto ou ZIP.",
      400
    );
  }

  const admin = createSupabaseAdminClient();
  const product = await loadProductInTenant(admin, tenantId, productId);
  if ("error" in product && product.error) {
    return apiError("Erro ao validar produto: " + product.error.message, 500);
  }
  if ("notFound" in product) return apiError("Produto não encontrado", 404);

  const storagePath = buildProductDocumentStoragePath(
    tenantId,
    productId,
    file.name
  );
  if (!storagePathBelongsToTenant(storagePath, tenantId)) {
    return apiError("Path de storage inválido.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(PRODUCT_DOCUMENT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (upErr) {
    return apiError(
      "Erro ao enviar ficheiro: " + upErr.message,
      supabaseErrorToHttp(null)
    );
  }

  const { data: row, error: insErr } = await admin
    .from("product_documents")
    .insert({
      tenant_id: tenantId,
      product_id: productId,
      kind: kindRaw,
      name,
      revision,
      file_name: file.name,
      mime_type: mime,
      file_size_bytes: file.size,
      storage_path: storagePath,
      uploaded_by: user.id,
      notes,
    })
    .select(
      "id, product_id, kind, name, revision, file_name, mime_type, file_size_bytes, uploaded_at, uploaded_by, notes, is_active"
    )
    .single();

  if (insErr) {
    await admin.storage.from(PRODUCT_DOCUMENT_BUCKET).remove([storagePath]);
    if (insErr.code === "23505") {
      return apiError(
        "Já existe um documento com este tipo, nome e revisão.",
        409
      );
    }
    return apiError(
      "Erro ao registar documento: " + insErr.message,
      supabaseErrorToHttp(insErr.code)
    );
  }

  return apiOk({ data: row }, 201);
}
