import { z } from "zod";

const boolFlags = z
  .object({
    dashboard: z.boolean().optional(),
    boards: z.boolean().optional(),
    production: z.boolean().optional(),
    purchasing: z.boolean().optional(),
    sales: z.boolean().optional(),
    products: z.boolean().optional(),
    settings: z.boolean().optional(),
    reports: z.boolean().optional(),
  })
  .strict();

export const userPermissionsUpdateSchema = z.object({
  permissions: boolFlags,
});

export type UserPermissionsUpdateInput = z.infer<
  typeof userPermissionsUpdateSchema
>;
