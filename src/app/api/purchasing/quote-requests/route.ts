import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  createPurchaseQuoteRequest,
  listPurchaseQuoteRequests,
  type QuoteRequestLineInput,
} from "@/modules/compras/lib/purchasing/request-purchase-quote";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const search = request.nextUrl.searchParams.get("search")?.trim() || undefined;
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);

  try {
    const admin = createSupabaseAdminClient();
    const rows = await listPurchaseQuoteRequests(admin, tenantId, {
      search,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    return apiOk({ rows });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar solicitações de orçamento",
      400
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const message = typeof b.message === "string" ? b.message : null;
  const notes = typeof b.notes === "string" ? b.notes : null;
  const request_date = typeof b.request_date === "string" ? b.request_date : null;
  const need_date = typeof b.need_date === "string" ? b.need_date : null;

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  const lines: QuoteRequestLineInput[] = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const description =
      typeof row.description === "string" ? row.description.trim() : "";
    const quantity = Number(row.quantity);
    const unit =
      typeof row.unit === "string" && row.unit.trim()
        ? row.unit.trim()
        : "UN";
    const product_id =
      typeof row.product_id === "string" && row.product_id.trim()
        ? row.product_id.trim()
        : null;
    const lineNeedDate =
      typeof row.need_date === "string" ? row.need_date : null;
    const show_product_description = row.show_product_description === true;
    if (!description && !product_id) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return apiError("Quantidade inválida em um dos itens.", 400);
    }
    lines.push({
      product_id,
      description: description || "Item para cotação",
      quantity,
      unit,
      need_date: lineNeedDate,
      show_product_description,
    });
  }

  if (!lines.length) {
    return apiError("Adicione pelo menos um item à solicitação.", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const data = await createPurchaseQuoteRequest(admin, tenantId, user.id, {
      request_date,
      need_date,
      notes,
      message,
      lines,
    });
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao gravar solicitação de orçamento",
      400
    );
  }
}
