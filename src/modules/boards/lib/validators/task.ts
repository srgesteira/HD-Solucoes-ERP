import { z } from "zod";
import { TASK_PRIORITIES } from "@/modules/core/types/kanban";

const prioritySchema = z.enum(TASK_PRIORITIES);

function toDueIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Para PATCH: só `undefined` = "não alterar"; null/string = atualiza. */
export function patchDueDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  return toDueIso(v);
}

export const createTaskSchema = z.object({
  board_id: z.string().uuid("Projeto inválido"),
  column_id: z.string().uuid("Coluna inválida"),
  title: z
    .string({ error: "Título é obrigatório" })
    .trim()
    .min(1, "Título não pode ficar vazio")
    .max(500, "Máximo 500 caracteres"),
  description: z
    .string()
    .max(50000)
    .optional()
    .nullable()
    .transform((v) => (v && String(v).trim() ? String(v).trim() : null)),
  priority: prioritySchema.optional().default("medium"),
  due_date: z
    .union([z.string(), z.null(), z.literal("")])
    .optional()
    .transform(toDueIso),
  assignee_id: z.union([z.string().uuid(), z.null()]).optional(),
  epic_id: z.string().uuid().optional().nullable(),
  area_id: z.union([z.string().uuid(), z.null()]).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.union([z.string().max(50000), z.null()]).optional(),
    priority: prioritySchema.optional(),
    due_date: z.union([z.string(), z.null(), z.literal("")]).optional(),
    assignee_id: z.union([z.string().uuid(), z.null()]).optional(),
    column_id: z.string().uuid().optional(),
    /** Posição final (0..n) dentro da coluna `column_id`; usado com DnD. */
    insert_index: z.number().int().min(0).optional(),
    area_id: z.union([z.string().uuid(), z.null()]).optional(),
    is_completed: z.boolean().optional(),
  })
  .strict()
  .refine(
    (d) => d.insert_index === undefined || d.column_id !== undefined,
    { message: "insert_index requer column_id" }
  );

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
