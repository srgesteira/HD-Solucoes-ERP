import { z } from "zod";
import {
  coerceSalesOrderInt,
  parsePaymentDaysBetween,
} from "@/lib/schemas/sales-order.schema";

export const purchaseOrderPaymentUpdateSchema = z.object({
  payment_installments: z.preprocess(
    (v) => coerceSalesOrderInt(v, 1),
    z.number().int().min(1, "Número de parcelas inválido")
  ),
  payment_days_to_first_due: z.preprocess(
    (v) => coerceSalesOrderInt(v, 30),
    z.number().int().min(0, "Dias da 1.ª parcela inválidos")
  ),
  payment_days_between_installments: z.preprocess(
    (v) => parsePaymentDaysBetween(v),
    z.number().int().min(0, "Dias entre parcelas inválidos")
  ),
});

export type PurchaseOrderPaymentUpdateInput = z.infer<
  typeof purchaseOrderPaymentUpdateSchema
>;

const moneyField = z.coerce.number().min(0);

const purchaseOrderItemLineSchema = z
  .object({
    id: z.string().uuid().optional(),
    product_id: z.preprocess(
      (v) =>
        v === undefined || v === null || v === ""
          ? null
          : String(v).trim() || null,
      z.string().uuid().nullable()
    ),
    description: z.string().trim().min(1, "Descrição obrigatória"),
    quantity: moneyField.positive("Quantidade inválida"),
    unit: z.string().trim().optional(),
    unit_price: moneyField,
    icms_rate: moneyField.max(100).optional(),
    icms_value: moneyField.optional(),
    icms_amount: moneyField.optional(),
    ipi_rate: moneyField.max(100).optional(),
    ipi_value: moneyField.optional(),
    ipi_amount: moneyField.optional(),
    tax_base: moneyField.optional(),
  })
  .transform((row) => ({
    id: row.id,
    product_id: row.product_id ?? null,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit?.trim() || "UN",
    unit_price: row.unit_price,
    icms_rate: row.icms_rate ?? 0,
    icms_value: row.icms_value ?? row.icms_amount ?? 0,
    ipi_rate: row.ipi_rate ?? 0,
    ipi_value: row.ipi_value ?? row.ipi_amount ?? 0,
    tax_base: row.tax_base,
  }));

export const purchaseOrderItemsPayloadSchema = z
  .array(purchaseOrderItemLineSchema)
  .min(1, "O pedido deve ter pelo menos um item");

export type PurchaseOrderItemLineInput = z.infer<
  typeof purchaseOrderItemLineSchema
>;

export const purchaseOrderUpsertBodySchema = z
  .object({
    po_number: z.string().trim().min(1).optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    order_date: z.string().optional(),
    expected_delivery: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    discount: moneyField.optional(),
    tax: moneyField.optional(),
    freight_cost: moneyField.optional(),
    insurance_cost: moneyField.optional(),
    other_costs: moneyField.optional(),
    total_tax_non_creditable: moneyField.optional(),
    payment_installments: z.coerce.number().int().min(1).optional(),
    payment_days_to_first_due: z.coerce.number().int().min(0).optional(),
    payment_days_between_installments: z.coerce.number().int().min(0).optional(),
    items: purchaseOrderItemsPayloadSchema.optional(),
  })
  .passthrough();
