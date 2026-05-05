import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Cliente Supabase com SERVICE_ROLE_KEY — uso restrito a rotas de servidor onde
 * RLS precisa ser bypassada (ex.: convites de board, jobs administrativos).
 * Nunca importar em Client Components.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
