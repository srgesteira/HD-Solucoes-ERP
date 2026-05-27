import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { Json } from "@/modules/core/types/database";

export type ProfileAccessRow = {
  id: string;
  role: string | null;
  permissions: Json | null;
  enabled_modules: string[] | null;
  role_keys: string[] | null;
  full_name: string | null;
  email: string | null;
  tenant_id: string | null;
};

export async function loadProfileAccess(
  userId: string
): Promise<ProfileAccessRow | null> {
  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("user_profiles")
    .select(
      "id, role, permissions, enabled_modules, role_keys, full_name, email, tenant_id"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ProfileAccessRow | null) ?? null;
}
