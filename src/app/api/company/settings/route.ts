import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { companySettingsUpdateSchema } from "@/lib/schemas/company.schema";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type CompanyRow = Database["public"]["Tables"]["company_settings"]["Row"];

function normalizeEmail(v: string | null | undefined): string | null {
  if (v === undefined || v === null || v === "") return null;
  return v.trim();
}

function normalizeWebsite(v: string | null | undefined): string | null {
  if (v === undefined || v === null || v.trim() === "") return null;
  return v.trim();
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao carregar configurações da empresa: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data as CompanyRow | null });
}

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem criar configurações.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("company_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    return apiError("Configurações já existem. Use PUT para atualizar.", 409);
  }

  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  const name =
    tenantRow && typeof tenantRow.name === "string" && tenantRow.name.trim() ?
      tenantRow.name.trim()
    : "Empresa";

  const insert: Database["public"]["Tables"]["company_settings"]["Insert"] = {
    tenant_id: tenantId,
    company_name: name,
    trade_name: name,
  };

  const { data, error } = await admin
    .from("company_settings")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return apiError(
      "Erro ao criar configurações: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data as CompanyRow }, 201);
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem atualizar configurações.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = companySettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: row, error: loadErr } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar configurações: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }

  if (!row) {
    return apiError(
      "Configurações não encontradas. Use POST para criar o registo inicial.",
      404
    );
  }

  const updatePayload: Database["public"]["Tables"]["company_settings"]["Update"] =
    {};

  if (b.cnpj !== undefined) updatePayload.cnpj = b.cnpj;
  if (b.company_name !== undefined) updatePayload.company_name = b.company_name;
  if (b.trade_name !== undefined) updatePayload.trade_name = b.trade_name;
  if (b.state_registration !== undefined) {
    updatePayload.state_registration = b.state_registration;
  }
  if (b.municipal_registration !== undefined) {
    updatePayload.municipal_registration = b.municipal_registration;
  }
  if (b.tax_regime !== undefined) updatePayload.tax_regime = b.tax_regime;
  if (b.address_street !== undefined) {
    updatePayload.address_street = b.address_street;
  }
  if (b.address_number !== undefined) {
    updatePayload.address_number = b.address_number;
  }
  if (b.address_complement !== undefined) {
    updatePayload.address_complement = b.address_complement;
  }
  if (b.address_neighborhood !== undefined) {
    updatePayload.address_neighborhood = b.address_neighborhood;
  }
  if (b.address_city !== undefined) updatePayload.address_city = b.address_city;
  if (b.address_state !== undefined) {
    updatePayload.address_state = b.address_state;
  }
  if (b.address_zip !== undefined) updatePayload.address_zip = b.address_zip;
  if (b.phone !== undefined) updatePayload.phone = b.phone;
  if (b.email !== undefined) updatePayload.email = normalizeEmail(b.email);
  if (b.website !== undefined) updatePayload.website = normalizeWebsite(b.website);
  if (b.logo_url !== undefined) {
    updatePayload.logo_url = b.logo_url === "" ? null : b.logo_url;
  }
  if (b.document_header !== undefined) {
    updatePayload.document_header = b.document_header;
  }
  if (b.document_footer !== undefined) {
    updatePayload.document_footer = b.document_footer;
  }
  if (b.default_ncm !== undefined) updatePayload.default_ncm = b.default_ncm;
  if (b.default_payment_terms !== undefined) {
    updatePayload.default_payment_terms = b.default_payment_terms;
  }
  if (b.default_delivery_days !== undefined) {
    updatePayload.default_delivery_days = b.default_delivery_days;
  }

  const { data, error } = await admin
    .from("company_settings")
    .update(updatePayload)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) {
    return apiError(
      "Erro ao gravar configurações: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data as CompanyRow });
}
