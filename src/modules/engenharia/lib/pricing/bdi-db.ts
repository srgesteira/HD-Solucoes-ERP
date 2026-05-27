import type { Database } from "@/modules/core/types/database";
import {
  type BdiSettingsSlice,
  coerceNum,
  defaultBdiSettings,
} from "@/modules/engenharia/lib/pricing/bdi-calculate";

export function bdiRowToSlice(
  row: Database["public"]["Tables"]["bdi_settings"]["Row"] | null
): BdiSettingsSlice {
  if (!row) return defaultBdiSettings();
  return {
    tax_icms: coerceNum(row.tax_icms),
    tax_pis: coerceNum(row.tax_pis),
    tax_cofins: coerceNum(row.tax_cofins),
    tax_ipi: coerceNum(row.tax_ipi),
    tax_iss: coerceNum(row.tax_iss),
    admin_overhead: coerceNum(row.admin_overhead, 15),
    commercial_overhead: coerceNum(row.commercial_overhead, 10),
    financial_overhead: coerceNum(row.financial_overhead, 5),
    profit_margin: coerceNum(row.profit_margin, 20),
    use_compound_bdi: row.use_compound_bdi ?? true,
    min_markup: coerceNum(row.min_markup),
    max_markup: coerceNum(row.max_markup, 100),
  };
}
