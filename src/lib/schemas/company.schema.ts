import { z } from "zod";

export const taxRegimeEnum = z.enum([
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
]);

export const companySettingsUpdateSchema = z.object({
  cnpj: z.string().max(32).nullable().optional(),
  company_name: z.string().min(1).max(500).optional(),
  trade_name: z.string().max(500).nullable().optional(),
  state_registration: z.string().max(120).nullable().optional(),
  municipal_registration: z.string().max(120).nullable().optional(),
  tax_regime: taxRegimeEnum.nullable().optional(),
  address_street: z.string().max(500).nullable().optional(),
  address_number: z.string().max(32).nullable().optional(),
  address_complement: z.string().max(200).nullable().optional(),
  address_neighborhood: z.string().max(200).nullable().optional(),
  address_city: z.string().max(200).nullable().optional(),
  address_state: z.string().max(8).nullable().optional(),
  address_zip: z.string().max(20).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  email: z
    .union([z.string().email().max(320), z.literal("")])
    .nullable()
    .optional(),
  website: z.string().max(500).nullable().optional(),
  logo_url: z
    .union([z.string().url().max(2000), z.literal("")])
    .nullable()
    .optional(),
  document_header: z.string().max(8000).nullable().optional(),
  document_footer: z.string().max(8000).nullable().optional(),
  default_ncm: z.string().max(32).nullable().optional(),
  default_payment_terms: z.string().max(200).nullable().optional(),
  default_delivery_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
});

export type CompanySettingsUpdateInput = z.infer<
  typeof companySettingsUpdateSchema
>;
