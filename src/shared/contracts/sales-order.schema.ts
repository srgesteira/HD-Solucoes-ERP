import { z } from "zod";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  return !Number.isNaN(Date.parse(`${s}T12:00:00.000Z`));
}

function coerceOptionalInt(val: unknown, defaultValue: number): number {
  if (val === null || val === undefined || val === "") return defaultValue;
  if (typeof val === "number") {
    return Number.isFinite(val) ? Math.trunc(val) : defaultValue;
  }
  const n = parseInt(String(val).trim(), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Data ISO (AAAA-MM-DD) obrigatória — prazo de entrega ao cliente. */
export const salesOrderExpectedDeliverySchema = z
  .string()
  .trim()
  .min(1, "Prazo de entrega é obrigatório")
  .refine(isValidIsoDate, "Data inválida (use AAAA-MM-DD)");

export const salesOrderCommercialUpdateSchema = z.object({
  expected_delivery: salesOrderExpectedDeliverySchema,
  payment_installments: z.preprocess(
    (v) => coerceOptionalInt(v, 1),
    z.number().int().min(1, "Número de parcelas inválido")
  ),
  payment_days_to_first_due: z.preprocess(
    (v) => coerceOptionalInt(v, 30),
    z.number().int().min(0, "Dias da 1.ª parcela inválidos")
  ),
  payment_days_between_installments: z.preprocess(
    (v) => coerceOptionalInt(v, 0),
    z.number().int().min(0, "Dias entre parcelas inválidos")
  ),
});

export type SalesOrderCommercialUpdateInput = z.infer<
  typeof salesOrderCommercialUpdateSchema
>;

/** Valida `expected_delivery` no body da API (criação). */
export function parseRequiredExpectedDelivery(
  raw: unknown
): { ok: true; value: string } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, message: "Prazo de entrega é obrigatório" };
  }
  const parsed = salesOrderExpectedDeliverySchema.safeParse(
    typeof raw === "string" ? raw : String(raw)
  );
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Prazo de entrega inválido";
    return { ok: false, message: msg };
  }
  return { ok: true, value: parsed.data };
}

/** Valida `expected_delivery` no body da API (actualização — não aceita null). */
export function parseExpectedDeliveryForUpdate(
  raw: unknown
): { ok: true; value: string } | { ok: false; message: string } {
  if (raw === null || raw === "") {
    return { ok: false, message: "Prazo de entrega é obrigatório" };
  }
  return parseRequiredExpectedDelivery(raw);
}

export function parsePaymentDaysBetween(raw: unknown): number {
  return coerceOptionalInt(raw, 0);
}

export function coerceSalesOrderInt(
  val: unknown,
  defaultValue: number
): number {
  return coerceOptionalInt(val, defaultValue);
}

const taxRateSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return v;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : v;
  },
  z.number().min(0).max(100)
);

const taxAmountSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return v;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : v;
  },
  z.number().min(0)
);

export const salesOrderItemPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  quantity: z.number().positive("Quantidade inválida"),
  unit: z.string().trim().optional(),
  unit_price: z.number().min(0, "Preço unitário inválido"),
  discount: taxAmountSchema.optional(),
  icms_rate: taxRateSchema.optional(),
  icms_value: taxAmountSchema.optional(),
  ipi_rate: taxRateSchema.optional(),
  ipi_value: taxAmountSchema.optional(),
  tax_base: taxAmountSchema.optional(),
});

export const salesOrderItemsPayloadSchema = z
  .array(salesOrderItemPayloadSchema)
  .min(1, "Adicione pelo menos um item ao pedido.");
