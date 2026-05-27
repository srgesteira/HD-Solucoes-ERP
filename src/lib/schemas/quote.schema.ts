import { z } from "zod";
import { QUOTE_SHIPPING_TYPES } from "@/lib/sales/quote-validity";

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
  delivery_deadline: z.string().nullable().optional(),
  expected_delivery_date: z.string().nullable().optional(),
  payment_installments: z.union([z.number().int().min(1), z.string()]).optional(),
  payment_days_to_first_due: z
    .union([z.number().int().min(0), z.string()])
    .optional(),
  payment_days_between_installments: z
    .union([z.number().int().min(0), z.string()])
    .optional(),
  shipping_type: z.enum(QUOTE_SHIPPING_TYPES).optional(),
  notes: z.string().nullable().optional(),
  discount: z.union([z.number().min(0), z.string()]).optional(),
  tax: z.union([z.number().min(0), z.string()]).optional(),
  items: z
    .array(quoteItemBodySchema)
    .min(1, "Adicione pelo menos um item ao orçamento"),
});

export type CreateQuoteBody = z.infer<typeof createQuoteBodySchema>;
