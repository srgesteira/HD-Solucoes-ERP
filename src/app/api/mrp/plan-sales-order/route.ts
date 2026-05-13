import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import {
  calculateMaterialRequirements,
  generatePurchaseOrders,
  processMrpForSalesOrder,
} from "@/lib/mrp-service";

export const dynamic = "force-dynamic";

type PlanAction = "requirements" | "purchase_orders" | "production";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem executar o MRP.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const sales_order_id =
    typeof b.sales_order_id === "string" ? b.sales_order_id.trim() : "";
  if (!sales_order_id) return apiError("sales_order_id é obrigatório.", 400);

  const actionRaw =
    typeof b.action === "string" ? b.action.trim().toLowerCase() : "";
  const action = (
    ["requirements", "purchase_orders", "production"] as const
  ).includes(actionRaw as PlanAction)
    ? (actionRaw as PlanAction)
    : null;

  const confirm = b.confirm === true;

  const admin = createSupabaseAdminClient();

  try {
    const requirements = await calculateMaterialRequirements(
      admin,
      tenantId,
      sales_order_id
    );
    const has_shortage = requirements.some((r) => r.shortage > 0.0001);

    if (action === "requirements") {
      return apiOk({
        requirements,
        summary: {
          has_shortage,
          lines: requirements.length,
          production_lines: 0,
        },
        process: {
          sales_order_id,
          order_number: "",
          lines: [],
        },
        purchase_orders: [],
        production_order_ids: [],
      });
    }

    if (action === "purchase_orders") {
      const poResult = await generatePurchaseOrders(
        admin,
        tenantId,
        user.id,
        requirements
      );
      return apiOk({
        requirements,
        summary: {
          has_shortage,
          lines: requirements.length,
          production_lines: 0,
        },
        process: {
          sales_order_id,
          order_number: "",
          lines: [],
        },
        purchase_orders: poResult.purchase_orders,
        production_order_ids: [],
      });
    }

    if (action === "production") {
      const processResult = await processMrpForSalesOrder(
        admin,
        tenantId,
        user.id,
        sales_order_id,
        true,
        { createTracePurchaseOrders: false }
      );

      const poById = new Map<
        string,
        { id: string; po_number: string; supplier_id: string | null }
      >();
      for (const line of processResult.lines) {
        for (const po of line.purchase_orders) {
          poById.set(po.id, po);
        }
      }
      const purchase_orders = [...poById.values()];

      const production_order_ids = [
        ...new Set(
          processResult.lines
            .map((l) => l.production_order_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];

      const opsCreatedOrLinked = processResult.lines.filter(
        (l) =>
          l.production_order_id != null &&
          l.skipped_reason !== "Já possui ordem de produção."
      );

      return apiOk({
        requirements,
        summary: {
          has_shortage,
          lines: requirements.length,
          production_lines: opsCreatedOrLinked.length,
        },
        process: processResult,
        purchase_orders,
        production_order_ids,
        production_order_id: production_order_ids[0],
      });
    }

    const processResult = await processMrpForSalesOrder(
      admin,
      tenantId,
      user.id,
      sales_order_id,
      confirm,
      confirm ? { createTracePurchaseOrders: true } : undefined
    );

    const poById = new Map<
      string,
      { id: string; po_number: string; supplier_id: string | null }
    >();
    for (const line of processResult.lines) {
      for (const po of line.purchase_orders) {
        poById.set(po.id, po);
      }
    }
    const purchase_orders = [...poById.values()];

    const production_order_ids = [
      ...new Set(
        processResult.lines
          .map((l) => l.production_order_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];

    const opsCreatedOrLinked = processResult.lines.filter(
      (l) =>
        l.production_order_id != null &&
        l.skipped_reason !== "Já possui ordem de produção."
    );

    return apiOk({
      requirements,
      summary: {
        has_shortage,
        lines: requirements.length,
        production_lines: opsCreatedOrLinked.length,
      },
      process: processResult,
      purchase_orders,
      production_order_ids,
      production_order_id: production_order_ids[0],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no MRP.";
    return apiError(msg, 400);
  }
}
