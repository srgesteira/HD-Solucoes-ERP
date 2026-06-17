import { z } from "zod";
import { QUOTE_SHIPPING_TYPES } from "@/modules/vendas/lib/sales/quote-validity";
import {
  HVAC_CLEANROOM_CLASSES,
  HVAC_FILTER_CLASSES,
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

/** Item de orçamento: `unit_price` obrigatório; `markup_percent` opcional (recalcula preço). */
export const quoteItemBodySchema = z.object({
  product_id: z.string().uuid({ message: "Produto inválido" }),
  quantity: z.union([
    z.number().positive("Quantidade deve ser maior que zero"),
    z.string().min(1),
  ]),
  unit_price: z.union([
    z.number().min(0, "Preço unitário inválido"),
    z.string().min(1),
  ]),
  markup_percent: z
    .union([z.number().min(0), z.string(), z.null()])
    .optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
  client_notes: z.string().nullable().optional(),
  show_product_description: z.boolean().optional(),
  hvac_filter_class: optionalEnum(HVAC_FILTER_CLASSES),
  hvac_airflow_m3h: z.number().min(0).nullable().optional(),
  hvac_cleanroom_class: optionalEnum(HVAC_CLEANROOM_CLASSES),
});

/**
 * Criação de orçamento: `customer_id` obrigatório; `client_name` opcional
 * (preenchido no servidor a partir do cadastro de clientes).
 */
export const createQuoteBodySchema = z.object({
  quote_number: z.string().optional(),
  customer_id: z.string().uuid({ message: "Selecione um cliente válido" }),
  client_name: z.string().optional(),
  client_email: z
    .union([z.string().email().max(320), z.literal(""), z.null()])
    .optional(),
  quote_date: z.string().optional(),
  validity_days: z.union([z.number().int().min(1), z.string()]).optional(),
  payment_terms: z.string().nullable().optional(),
  /** Dias úteis para entrega (campo principal no formulário). */
  delivery_business_days: z
    .union([z.number().int().min(1), z.string()])
    .nullable()
    .optional(),
  /** Legado: aceita número em string; ignorar texto livre antigo. */
  delivery_deadline: z.union([z.number().int().min(1), z.string()]).nullable().optional(),
  expected_delivery_date: z.string().nullable().optional(),
  payment_installments: z.union([z.number().int().min(1), z.string()]).optional(),
  payment_days_to_first_due: z
    .union([z.number().int().min(0), z.string()])
    .optional(),
  payment_days_between_installments: z
    .union([z.number().int().min(0), z.string()])
    .optional(),
  shipping_type: z.enum(QUOTE_SHIPPING_TYPES).optional(),
  freight_cost: z.union([z.number().min(0), z.string()]).optional(),
  notes: z.string().nullable().optional(),
  discount: z.union([z.number().min(0), z.string()]).optional(),
  tax: z.union([z.number().min(0), z.string()]).optional(),
  items: z
    .array(quoteItemBodySchema)
    .min(1, "Adicione pelo menos um item ao orçamento"),
});

export type CreateQuoteBody = z.infer<typeof createQuoteBodySchema>;
