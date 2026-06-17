import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  listProductChecklistItems,
  productHasActivePopDocument,
  saveProductChecklistItems,
} from "@/modules/hvac/lib/hvac-pop-checklist-service";
import { saveHvacChecklistSchema } from "@/shared/contracts/hvac-pop-checklist.schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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

  try {
    const admin = createSupabaseAdminClient();
    const items = await listProductChecklistItems(admin, tenantId, productId);
    const hasPopDocument = await productHasActivePopDocument(
      admin,
      tenantId,
      productId
    );
    return apiOk({ items, has_pop_document: hasPopDocument });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar checklist",
      400
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = saveHvacChecklistSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Dados inválidos", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const items = await saveProductChecklistItems(admin, {
      tenantId,
      productId,
      input: parsed.data,
    });
    return apiOk({ items });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao gravar checklist",
      400
    );
  }
}
