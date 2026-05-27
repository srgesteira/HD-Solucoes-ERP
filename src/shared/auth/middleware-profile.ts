import { createClient } from "@supabase/supabase-js";
import type { MiddlewareAccessProfile } from "@/shared/auth/route-module-guard";

export async function loadMiddlewareAccessProfile(
  userId: string
): Promise<MiddlewareAccessProfile | null> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) return null;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("user_profiles")
    .select("role, enabled_modules, permissions")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as MiddlewareAccessProfile;
}
