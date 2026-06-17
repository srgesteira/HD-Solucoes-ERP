import { z } from "zod";
import {
  HVAC_CLEANROOM_CLASSES,
  HVAC_FILTER_CLASSES,
  HVAC_INTEGRITY_TEST_METHODS,
} from "@/modules/hvac/lib/hvac-domain";

const optionalEnum = <T extends readonly string[]>(values: T) =>
  z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => v == null || v === "" || (values as readonly string[]).includes(v),
      { message: "Valor inválido" }
    );

export const hvacProductSpecsSchema = z
  .object({
    hvac_filter_class: optionalEnum(HVAC_FILTER_CLASSES),
    hvac_airflow_m3h: z.number().min(0).nullable().optional(),
    hvac_pressure_drop_pa: z.number().min(0).nullable().optional(),
    hvac_cleanroom_class: optionalEnum(HVAC_CLEANROOM_CLASSES),
    hvac_requires_integrity_test: z.boolean().optional(),
    hvac_integrity_test_method: optionalEnum(HVAC_INTEGRITY_TEST_METHODS),
  })
  .superRefine((data, ctx) => {
    if (
      data.hvac_requires_integrity_test &&
      !data.hvac_integrity_test_method?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o método de teste de integridade.",
        path: ["hvac_integrity_test_method"],
      });
    }
  });

export type HvacProductSpecsInput = z.infer<typeof hvacProductSpecsSchema>;
