import { z } from "zod";

/** Cadastro rápido pelo comercial (sem BOM); engenharia completa a estrutura depois. */
export const commercialProductQuickCreateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().optional().nullable(),
  unit: z.string().min(1).default("UN"),
  prefix_id: z.uuid({ message: "Prefixo é obrigatório" }),
  family_id: z.uuid().optional().nullable(),
  subfamily_id: z.uuid().optional().nullable(),
  material_id: z.uuid({ message: "Material é obrigatório" }),
  finish_id: z.uuid({ message: "Acabamento é obrigatório" }),
  source_quote_id: z.uuid().optional().nullable(),
});
