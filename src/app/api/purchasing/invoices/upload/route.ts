import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { extractPurchaseNF } from "@/lib/services/ai.service";
import { buildPurchaseInvoiceReconciliation } from "@/lib/purchasing/purchase-invoice-reconcile";

export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão para importar NF-e de compra.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("FormData inválido", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError('Campo "file" é obrigatório.', 400);
  }
  if (file.size <= 0) return apiError("Ficheiro vazio.", 400);
  if (file.size > MAX_BYTES) {
    return apiError("PDF demasiado grande (máx. 12 MB).", 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const invoiceData = await extractPurchaseNF(buf);
    const admin = createSupabaseAdminClient();
    const reconciliation = await buildPurchaseInvoiceReconciliation(
      admin,
      tenantId,
      invoiceData
    );

    return apiOk({ data: reconciliation });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na extração.";
    return apiError(msg, 400);
  }
}
