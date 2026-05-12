import { z } from "zod";

const pct = z.number().min(0).max(999.99);

export const bdiSettingsUpdateSchema = z.object({
  tax_icms: pct.optional(),
  tax_pis: pct.optional(),
  tax_cofins: pct.optional(),
  tax_ipi: pct.optional(),
  tax_iss: pct.optional(),
  admin_overhead: pct.optional(),
  commercial_overhead: pct.optional(),
  financial_overhead: pct.optional(),
  profit_margin: pct.optional(),
  use_compound_bdi: z.boolean().optional(),
  min_markup: pct.optional(),
  max_markup: pct.optional(),
});

export type BdiSettingsUpdateInput = z.infer<typeof bdiSettingsUpdateSchema>;
