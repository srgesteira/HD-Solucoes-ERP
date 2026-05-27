import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

export type CustomerRow = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export async function fetchCustomerForTenant(
  admin: Admin,
  tenantId: string,
  customerId: string
): Promise<CustomerRow | null> {
  const { data, error } = await admin
    .from("customers")
    .select("id, name, document, email, phone, address, is_active")
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[fetchCustomerForTenant] erro na consulta", {
      customerId,
      tenantId,
      message: error.message,
    });
    return null;
  }

  if (!data) {
    console.warn("[fetchCustomerForTenant] cliente não encontrado", {
      customerId,
      tenantId,
    });
    return null;
  }

  if (!data.is_active) {
    console.warn("[fetchCustomerForTenant] cliente inativo", {
      customerId,
      tenantId,
    });
    return null;
  }

  const { is_active: _inactive, ...row } = data;
  return row as CustomerRow;
}
