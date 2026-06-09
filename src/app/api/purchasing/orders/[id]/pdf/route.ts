import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { fetchPurchaseOrderPrintContext } from "@/modules/compras/lib/purchasing/fetch-purchase-order-print";
import { generatePurchaseOrderPdfBuffer } from "@/modules/compras/lib/purchasing/generate-purchase-order-pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão", 403);
  }

  const admin = createSupabaseAdminClient();
  const ctx = await fetchPurchaseOrderPrintContext(admin, tenantId, id);
  if (!ctx) return apiError("Pedido não encontrado", 404);

  try {
    const buffer = await generatePurchaseOrderPdfBuffer(ctx);
    const filename = `pedido-${ctx.order.po_number.replace(/[^\w.-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao gerar PDF",
      500
    );
  }
}
