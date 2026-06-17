import { z } from "zod";
import { HVAC_INTEGRITY_TEST_METHODS } from "@/modules/hvac/lib/hvac-domain";

export const hvacIntegrityTestResultSchema = z.enum(["pass", "fail"]);

export const registerHvacIntegrityTestSchema = z.object({
  order_item_id: z.string().uuid(),
  test_method: z
    .string()
    .trim()
    .min(1, "Informe o método de teste.")
    .refine(
      (v) => (HVAC_INTEGRITY_TEST_METHODS as readonly string[]).includes(v),
      { message: "Método de teste inválido." }
    ),
  test_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (AAAA-MM-DD)."),
  result: hvacIntegrityTestResultSchema,
  leakage_rate: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type RegisterHvacIntegrityTestInput = z.infer<
  typeof registerHvacIntegrityTestSchema
>;
