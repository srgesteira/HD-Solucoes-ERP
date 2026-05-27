import { z } from "zod";

export const purchaseInvoiceMappingSchema = z.object({
  invoiceLineIndex: z.number().int().min(0),
  productId: z.string().uuid("Produto inválido"),
  quantity: z.number().positive("Quantidade inválida"),
  unitPrice: z.number().min(0).optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  purchaseOrderItemId: z.string().uuid().nullable().optional(),
  isNewPurchase: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const purchaseInvoiceConfirmSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  invoiceData: z.object({
    supplierName: z.string().optional(),
    supplierDocument: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceSeries: z.string().optional(),
    accessKey: z.string().optional(),
    issueDate: z.string().optional(),
    totalAmount: z.number().optional(),
    items: z.array(z.unknown()).min(1),
  }),
  mappings: z
    .array(purchaseInvoiceMappingSchema)
    .min(1, "Indique pelo menos um mapeamento."),
  invoiceNotes: z.string().max(4000).nullable().optional(),
});

export type PurchaseInvoiceConfirmInput = z.infer<
  typeof purchaseInvoiceConfirmSchema
>;
