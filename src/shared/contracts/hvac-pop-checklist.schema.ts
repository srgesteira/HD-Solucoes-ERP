import { z } from "zod";

export const hvacChecklistItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  sequence: z.number().int().min(1),
  label: z.string().trim().min(1, "Descrição do item é obrigatória."),
  detail: z.string().trim().nullable().optional(),
  is_required: z.boolean().optional(),
});

export const saveHvacChecklistSchema = z.object({
  items: z.array(hvacChecklistItemInputSchema).min(1, "Informe ao menos um item."),
});

export const upsertHvacChecklistCompletionsSchema = z.object({
  order_item_id: z.string().uuid(),
  completions: z.array(
    z.object({
      checklist_item_id: z.string().uuid(),
      completed: z.boolean(),
      notes: z.string().max(500).nullable().optional(),
    })
  ),
});

export type SaveHvacChecklistInput = z.infer<typeof saveHvacChecklistSchema>;
export type UpsertHvacChecklistCompletionsInput = z.infer<
  typeof upsertHvacChecklistCompletionsSchema
>;
