import { z } from "zod";

export const taxRegimeEnum = z.enum([
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
]);

export const focusNFeEnvironmentEnum = z.enum(["homologacao", "producao"]);

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
  cash_flow_opening_balance: z.coerce
    .number()
    .min(-999999999.99)
    .max(999999999.99)
    .optional(),
  das_aliquot: z.coerce.number().min(0).max(100).nullable().optional(),
  focusnfe_token: z.string().max(2000).nullable().optional(),
  focusnfe_environment: focusNFeEnvironmentEnum.optional(),
  nfse_item_lista_servico: z.string().max(32).nullable().optional(),
  nfse_iss_aliquota: z.coerce.number().min(0).max(100).nullable().optional(),
  nfse_prestador_codigo_municipio: z.string().max(16).nullable().optional(),
  nfse_codigo_nbs: z.string().max(32).nullable().optional(),
  nfse_codigo_indicador_operacao: z.string().max(32).nullable().optional(),
  nfse_ibs_cbs_classificacao_tributaria: z.string().max(32).nullable().optional(),
  nfse_use_sao_paulo_payload: z.boolean().optional(),
  nfse_codigo_tributario_municipio: z.string().max(32).nullable().optional(),
});

export type CompanySettingsUpdateInput = z.infer<
  typeof companySettingsUpdateSchema
>;
