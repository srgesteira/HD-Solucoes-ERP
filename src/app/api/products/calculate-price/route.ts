import { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import {
  approximateBdiBreakdown,
  calculateBdiSellingPrice,
  totalTaxPctFromSettingsOrCompany,
} from "@/lib/pricing/bdi-calculate";
import { bdiRowToSlice } from "@/lib/pricing/bdi-db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().min(0.000001).max(1e9).optional().default(1),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const { product_id, quantity } = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: product, error: pErr } = await admin
    .from("products")
    .select(
      "id, cost_price, use_custom_bdi, custom_tax_rate, custom_profit_margin"
    )
    .eq("id", product_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (pErr) {
    return apiError(
      "Erro ao buscar produto: " + pErr.message,
      supabaseErrorToHttp(pErr.code)
    );
  }
  if (!product) return apiError("Produto não encontrado", 404);

  const unitCost = Number(product.cost_price ?? 0);
  const lineCost = unitCost * quantity;

  const custom = Boolean(product.use_custom_bdi);
  const overrideTax =
    custom && product.custom_tax_rate != null
      ? Number(product.custom_tax_rate)
      : null;
  const overrideProfit =
    custom && product.custom_profit_margin != null
      ? Number(product.custom_profit_margin)
      : null;

  const { data: settingsRow } = await admin
    .from("bdi_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: companyRow } = await admin
    .from("company_settings")
    .select("tax_regime, das_aliquot")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const slice = bdiRowToSlice(settingsRow);

  const unitSelling = calculateBdiSellingPrice({
    cost: unitCost,
    settings: slice,
    overrideTaxPct: overrideTax,
    overrideProfitPct: overrideProfit,
    companyTaxRegime: companyRow?.tax_regime ?? null,
    companyDasAliquot:
      companyRow?.das_aliquot != null ?
        Number(companyRow.das_aliquot)
      : null,
  });

  const effectiveTaxPct =
    overrideTax !== null ?
      overrideTax
    : totalTaxPctFromSettingsOrCompany(
        slice,
        companyRow?.tax_regime ?? null,
        companyRow?.das_aliquot != null ?
          Number(companyRow.das_aliquot)
        : null
      );

  const lineSelling = Math.round(unitSelling * quantity * 100) / 100;

  const breakdownUnit = approximateBdiBreakdown(unitCost, unitSelling, {
    taxes: effectiveTaxPct,
    admin: slice.admin_overhead,
    commercial: slice.commercial_overhead,
    financial: slice.financial_overhead,
    profit: overrideProfit !== null ? overrideProfit : slice.profit_margin,
  });

  const totalParts = breakdownUnit.reduce((s, x) => s + x.amount, 0) || 1;
  const breakdownPct = breakdownUnit.map((x) => ({
    label: x.label,
    amount: Math.round(x.amount * quantity * 100) / 100,
    pct_of_price: Math.round((x.amount / totalParts) * 1000) / 10,
    color: x.color,
  }));

  return apiOk({
    data: {
      product_id,
      quantity,
      unit_cost_price: unitCost,
      line_cost_price: Math.round(lineCost * 100) / 100,
      unit_selling_price: unitSelling,
      line_selling_price: lineSelling,
      use_custom_bdi: custom,
      bdi_compound: slice.use_compound_bdi,
      company_tax_regime: companyRow?.tax_regime ?? null,
      company_das_aliquot:
        companyRow?.das_aliquot != null ?
          Number(companyRow.das_aliquot)
        : null,
      effective_tax_pct: effectiveTaxPct,
      effective_profit_pct:
        overrideProfit !== null ? overrideProfit : slice.profit_margin,
      breakdown_unit: breakdownUnit.map((x) => ({
        label: x.label,
        amount: x.amount,
        color: x.color,
      })),
      breakdown_scaled: breakdownPct,
    },
  });
}
