import { z } from "zod";

const productNatureEnum = z.enum(["MP", "SE", "EB", "MC", "RV", "AC"], {
  message: "Natureza do produto é obrigatória",
});

/** Classificação técnica (código tipo HD1-A10A10-001): FKs obrigatórias na criação. */
export const technicalClassificationSchema = z.object({
  prefix_id: z.uuid({ message: "Prefixo é obrigatório" }),
  family_id: z.uuid({ message: "Família é obrigatória" }),
  subfamily_id: z.uuid({ message: "Sub-família é obrigatória" }),
  material_id: z.uuid({ message: "Material é obrigatório" }),
  finish_id: z.uuid({ message: "Acabamento é obrigatório" }),
});

const productSharedFields = {
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().optional().nullable(),
  technical_description: z.string().optional().nullable(),
  ncm: z.string().optional().nullable(),
  unit: z.string().min(1, "Unidade é obrigatória"),
  type: z.enum(["finished", "raw", "component"]),
  cost_price: z.number().min(0).default(0),
  selling_price: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  use_custom_bdi: z.boolean().optional(),
  custom_tax_rate: z.number().min(0).max(999).nullable().optional(),
  custom_profit_margin: z.number().min(0).max(999).nullable().optional(),
  prefix_id: z.uuid().optional().nullable(),
  family_id: z.uuid().optional().nullable(),
  subfamily_id: z.uuid().optional().nullable(),
  material_id: z.uuid().optional().nullable(),
  finish_id: z.uuid().optional().nullable(),
};

/** Criação: sem campo `code` manual; identificador = technical_code gerado na BD. */
export const productCreateSchema = z
  .object(productSharedFields)
  .merge(technicalClassificationSchema)
  .extend({
    product_nature: productNatureEnum,
  });

/** Actualização parcial; `code` legado opcional (não usar na UI). */
export const productSchema = z.object({
  ...productSharedFields,
  product_nature: productNatureEnum.optional().nullable(),
  code: z.string().max(50).optional().nullable(),
});

export const productComponentSchema = z
  .object({
    parent_product_id: z.string().uuid(),
    component_product_id: z.string().uuid().nullable().optional(),
    quantity: z.number().min(0.000001, "Quantidade deve ser maior que zero"),
    is_labor: z.boolean().default(false),
    /** Mão-de-obra externa: sem centro; custo unitário obrigatório no body. */
    is_external_labor: z.boolean().optional().default(false),
    work_center_id: z.string().uuid().nullable().optional(),
    unit_cost: z.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.is_labor) {
      const external = data.is_external_labor === true;
      if (data.component_product_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Linha de mão de obra não deve referenciar produto componente",
          path: ["component_product_id"],
        });
      }
      if (external) {
        if (data.work_center_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Mão de obra externa não deve ter centro de trabalho",
            path: ["work_center_id"],
          });
        }
        if (
          data.unit_cost === undefined ||
          data.unit_cost === null ||
          Number.isNaN(data.unit_cost)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Custo unitário (R$) é obrigatório para mão de obra externa",
            path: ["unit_cost"],
          });
        }
      } else if (!data.work_center_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Centro de trabalho é obrigatório para mão de obra interna",
          path: ["work_center_id"],
        });
      }
    } else if (!data.component_product_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Produto componente é obrigatório para material",
        path: ["component_product_id"],
      });
    }
  });

export const workCenterSchema = z.object({
  code: z.string().min(1, "Código é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  hourly_cost: z.number().min(0).default(0),
  efficiency: z.number().min(0).max(2).default(1),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  default_monthly_hours: z.coerce.number().int().min(1).max(400).default(220),
});
