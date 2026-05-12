import { z } from "zod";

export const createEpicSchema = z.object({
  board_id: z.string().uuid("Projeto inválido"),
  title: z
    .string({ error: "Título é obrigatório" })
    .trim()
    .min(1, "Indique um título")
    .max(200, "Máximo 200 caracteres"),
  description: z
    .string()
    .max(10000)
    .optional()
    .nullable()
    .transform((v) => (v && String(v).trim() ? String(v).trim() : null)),
});

export type CreateEpicInput = z.infer<typeof createEpicSchema>;
