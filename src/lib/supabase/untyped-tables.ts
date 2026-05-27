import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/** Cliente com tabelas ainda não presentes em database.ts (após migration, regenerar tipos). */
export type UntypedAdmin = SupabaseClient<Database> & {
  from: (relation: string) => ReturnType<SupabaseClient<Database>["from"]>;
};

export function asUntypedAdmin(client: SupabaseClient<Database>): UntypedAdmin {
  return client as UntypedAdmin;
}
