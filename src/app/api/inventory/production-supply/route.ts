import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
  currentUserCanModule,
} from "@/modules/core/lib/tenant";
import {
  applyProductionSupply,
  getProductionSupplyBomPreview,
  listProductionSupplyPending,
  searchSupplySubstituteProducts,
  type ProductionSupplyMaterialOverride,
} from "@/modules/almoxarifado/lib/production-supply";

export const dynamic = "force-dynamic";

async function assertInventoryAccess(): Promise<Response | null> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (
    !(await isCurrentUserTenantAdmin()) &&
    !(await currentUserCanModule("inventory"))
  ) {
    return apiError("Sem permissão para o almoxarifado.", 403);
  }

  return null;
}

/** GET — OPs pendentes ou preview BOM / busca de substituto */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const denied = await assertInventoryAccess();
  if (denied) return denied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const params = request.nextUrl.searchParams;
  const previewId = params.get("order_item_id")?.trim() ?? "";
  const search = params.get("search")?.trim() ?? "";
  const excludeRaw = params.get("exclude")?.trim() ?? "";

  try {
    const admin = createSupabaseAdminClient();

    if (search) {
      const exclude = excludeRaw
        ? excludeRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const data = await searchSupplySubstituteProducts(
        admin,
        tenantId,
        search,
        exclude
      );
      return apiOk({ data });
    }

    if (previewId) {
      const data = await getProductionSupplyBomPreview(
        admin,
        tenantId,
        previewId
      );
      return apiOk({ data });
    }

    const data = await listProductionSupplyPending(admin, tenantId);
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar abastecimento",
      400
    );
  }
}

/** POST — confirma abastecimento (baixa estoque BOM, com trocas opcionais) */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const denied = await assertInventoryAccess();
  if (denied) return denied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const orderItemId =
    typeof b.order_item_id === "string" ? b.order_item_id : null;
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  let materials: ProductionSupplyMaterialOverride[] | undefined;
  if (Array.isArray(b.materials)) {
    materials = b.materials.map((row) => {
      const r =
        row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        product_id: typeof r.product_id === "string" ? r.product_id : "",
        quantity: Number(r.quantity ?? 0),
        original_product_id:
          typeof r.original_product_id === "string"
            ? r.original_product_id
            : null,
      };
    });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await applyProductionSupply(
      admin,
      tenantId,
      orderItemId,
      user.id,
      { materials }
    );
    return apiOk(result);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao abastecer produção",
      400
    );
  }
}
