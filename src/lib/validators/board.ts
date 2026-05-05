import { z } from "zod";

export const createBoardSchema = z.object({
  name: z
    .string({ error: "Nome é obrigatório" })
    .trim()
    .min(2, "Use ao menos 2 caracteres")
    .max(200, "Máximo 200 caracteres"),
  description: z
    .string()
    .trim()
    .max(2000, "Máximo 2000 caracteres")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use formato #RRGGBB)")
    .optional()
    .default("#0f766e"),
  icon: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = createBoardSchema.partial().extend({
  is_archived: z.boolean().optional(),
});

export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
