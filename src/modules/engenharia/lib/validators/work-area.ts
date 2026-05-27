import { z } from "zod";

export const createWorkAreaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Código muito curto")
    .max(30)
    .regex(/^[A-Z0-9._-]+$/, "Use apenas letras maiúsculas, números, ._-"),
  name: z.string().trim().min(1).max(200),
  description: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : null)),
});

export type CreateWorkAreaInput = z.infer<typeof createWorkAreaSchema>;

export const updateWorkAreaSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.union([z.string().max(500), z.null()]).optional(),
  sort_order: z.number().int().optional(),
  is_archived: z.boolean().optional(),
});

export type UpdateWorkAreaInput = z.infer<typeof updateWorkAreaSchema>;
