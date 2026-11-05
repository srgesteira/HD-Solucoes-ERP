import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Tables } from "@/modules/core/types/database";
import type { QuotePrintData } from "@/modules/vendas/lib/sales/quote-display";
import { generateQuotePdfBuffer } from "@/modules/vendas/lib/sales/generate-quote-pdf";
import { quoteFileName } from "@/modules/vendas/lib/sales/send-quote-email";
import { sortQuoteItemsByLineNumber } from "@/modules/vendas/lib/sales/quote-items-order";
import {
  confidentialPricingErrorMessage,
  findConfidentialPricingText,
} from "@/modules/vendas/lib/sales/quote-confidential-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Geração de PDF com Chromium headless (cold start ~5–10 s). */
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const QUOTE_DETAIL_SELECT = `
  *,
  customer:customers(id, name, document, email, phone, address),
  items:quote_items(
    *,
    product:products!quote_items_product_id_fkey(*)
  )
`.trim();

/** GET — PDF do orçamento (mesmo layout do envio por e-mail), para download. */
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
  const canSales = await currentUserCanModule("sales");
  if (!isAdmin && !canSales) return apiError("Sem permissão", 403);

  const admin = createSupabaseAdminClient();
  const { data: quote, error } = await admin
    .from("quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return apiError("Erro ao buscar orçamento: " + error.message, 500);
  if (!quote) return apiError("Orçamento não encontrado", 404);

  const row = quote as unknown as Record<string, unknown> & { items?: unknown };
  const sorted = {
    ...row,
    items: Array.isArray(row.items)
      ? sortQuoteItemsByLineNumber(
          row.items as Array<{ line_number?: number | null; created_at?: string | null; id?: string | null }>
        )
      : row.items,
  } as unknown as QuotePrintData;

  const hits = findConfidentialPricingText(sorted);
  if (hits.length) return apiError(confidentialPricingErrorMessage(hits), 422);

  const { data: company } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  try {
    const buffer = await generateQuotePdfBuffer(
      sorted,
      (company as Tables<"company_settings"> | null) ?? null
    );
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quoteFileName(sorted)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Erro ao gerar PDF", 500);
  }
}
