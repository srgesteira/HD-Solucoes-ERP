import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Cliente Supabase para uso em Client Components.
 * Retorna `null` quando NEXT_PUBLIC_SUPABASE_URL/ANON_KEY não estão configurados,
 * permitindo que a UI exiba aviso amigável em vez de quebrar.
 */
export function createClient(): SupabaseClient<Database> | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  const urlValid = url.startsWith("http://") || url.startsWith("https://");

  if (!urlValid || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[erp-hd] Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local."
      );
    }
    return null;
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient<Database>(url, anonKey);
  }

  return cachedClient;
}
