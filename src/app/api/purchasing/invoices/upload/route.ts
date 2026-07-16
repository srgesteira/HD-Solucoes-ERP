import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { extractPurchaseNF } from "@/modules/engenharia/lib/services/ai.service";
import { buildPurchaseInvoiceReconciliation } from "@/modules/compras/lib/purchasing/purchase-invoice-reconcile";
import {
  isLikelyNfeXml,
  isLikelyPdf,
  parsePurchaseNfeXml,
} from "@/modules/compras/lib/purchasing/parse-purchase-nfe-xml";
import type { PurchaseNFExtraction } from "@/modules/compras/lib/purchasing/purchase-nf-types";

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
    return apiError("Ficheiro demasiado grande (máx. 12 MB).", 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "upload";
  const mime = file.type || "";

  try {
    let invoiceData: PurchaseNFExtraction;
    let source: "xml" | "pdf_ai";

    if (isLikelyNfeXml(fileName, mime, buf)) {
      invoiceData = parsePurchaseNfeXml(buf);
      source = "xml";
    } else if (isLikelyPdf(fileName, mime, buf)) {
      invoiceData = await extractPurchaseNF(buf);
      source = "pdf_ai";
    } else {
      return apiError(
        "Formato não suportado. Envie PDF (DANFE) ou XML da NF-e.",
        400
      );
    }

    const admin = createSupabaseAdminClient();
    const reconciliation = await buildPurchaseInvoiceReconciliation(
      admin,
      tenantId,
      invoiceData
    );

    return apiOk({ data: { ...reconciliation, source } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na extração.";
    return apiError(msg, 400);
  }
}
