import "server-only";

/** Tabelas do CRM expostas em /api/crm/[entity] e os campos que podem ser gravados. */
export const CRM_ENTITIES = {
  contacts: {
    table: "crm_contacts",
    fields: ["customer_id", "name", "role", "email", "phone", "whatsapp", "linkedin_url", "is_primary", "is_decision_maker", "notes"],
    required: ["customer_id", "name"],
    order: "name",
  },
  opportunities: {
    table: "crm_opportunities",
    fields: [
      "customer_id", "contact_id", "title", "stage", "amount", "probability", "expected_close", "cost_center_id",
      "quote_id", "sales_order_id", "sales_rep_id", "source", "lost_reason", "next_action", "next_action_at", "closed_at", "notes",
    ],
    required: ["customer_id", "title"],
    order: "updated_at",
  },
  activities: {
    table: "crm_activities",
    fields: [
      "customer_id", "opportunity_id", "contact_id", "type", "direction", "occurred_at", "summary", "outcome", "due_at", "done", "created_by",
    ],
    required: ["type", "summary"],
    order: "occurred_at",
  },
  reps: {
    table: "sales_reps",
    fields: ["name", "email", "phone", "user_profile_id", "commission_pct", "commission_base", "is_active"],
    required: ["name"],
    order: "name",
  },
} as const;

export type CrmEntity = keyof typeof CRM_ENTITIES;

export function isCrmEntity(v: string): v is CrmEntity {
  return v in CRM_ENTITIES;
}

export function pickFields(entity: CrmEntity, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of CRM_ENTITIES[entity].fields) {
    if (f in body) {
      const v = body[f];
      out[f] = typeof v === "string" && v.trim() === "" ? null : v;
    }
  }
  return out;
}

/** Campos do cadastro do cliente editáveis pelo perfil (fiscal + comercial + CRM). */
export const CUSTOMER_PROFILE_FIELDS = [
  "name", "trade_name", "person_type", "document", "state_registration", "municipal_registration", "email", "invoice_email",
  "phone", "address", "address_street", "address_number", "address_complement", "address_neighborhood", "address_city",
  "address_state", "address_zip", "ibge_city_code", "tax_regime", "icms_taxpayer", "final_consumer", "suframa", "fiscal_notes",
  "sales_rep_id", "default_payment_terms", "segment", "website", "linkedin_url", "instagram", "crm_stage", "lead_source",
  "lead_score", "last_contact_at", "next_contact_at", "next_action", "tags", "credit_limit", "notes", "is_active",
] as const;
