import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  getPurchaseQuoteRequest,
  updatePurchaseQuoteRequest,
  type QuoteRequestLineInput,
} from "@/modules/compras/lib/purchasing/request-purchase-quote";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseLines(rawLines: unknown): QuoteRequestLineInput[] | { error: string } {
  if (!Array.isArray(rawLines)) {
    return { error: "Itens inválidos." };
  }
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
    const id =
      typeof row.id === "string" && row.id.trim() ? row.id.trim() : undefined;
    const show_product_description = row.show_product_description === true;
    if (!description && !product_id) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "Quantidade inválida em um dos itens." };
    }
    lines.push({
      id,
      product_id,
      description: description || "Item para cotação",
      quantity,
      unit,
      need_date: lineNeedDate,
      show_product_description,
    });
  }
  if (!lines.length) {
    return { error: "Adicione pelo menos um item à solicitação." };
  }
  return lines;
}

export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  if (!id) return apiError("ID em falta", 400);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const data = await getPurchaseQuoteRequest(admin, tenantId, id);
    if (!data) return apiError("Solicitação não encontrada", 404);
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar solicitação",
      400
    );
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const { id } = await context.params;
  if (!id) return apiError("ID em falta", 400);

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

  const parsed = parseLines(b.lines);
  if ("error" in parsed) return apiError(parsed.error, 400);

  try {
    const admin = createSupabaseAdminClient();
    const data = await updatePurchaseQuoteRequest(admin, tenantId, id, {
      request_date,
      need_date,
      notes,
      message,
      lines: parsed,
    });
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao actualizar solicitação",
      400
    );
  }
}
