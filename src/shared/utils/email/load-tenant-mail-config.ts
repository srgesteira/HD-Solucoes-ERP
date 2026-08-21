import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  resolveMailConfig,
  type OutboundMailConfig,
} from "@/shared/utils/email/mail-config";

type Admin = SupabaseClient<Database>;

export async function loadTenantMailConfig(
  admin: Admin,
  tenantId: string
): Promise<OutboundMailConfig | null> {
  const db = asUntypedAdmin(admin);
  const { data } = await db
    .from("company_settings")
    .select(
      "smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name, smtp_from_email, smtp_secure, company_name, trade_name, email"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return resolveMailConfig(
    (data as {
      smtp_host?: string | null;
      smtp_port?: number | null;
      smtp_user?: string | null;
      smtp_password?: string | null;
      smtp_from_name?: string | null;
      smtp_from_email?: string | null;
      smtp_secure?: boolean | null;
      company_name?: string | null;
      trade_name?: string | null;
      email?: string | null;
    } | null) ?? null
  );
}
