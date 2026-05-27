import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

/** Cliente com tabelas ainda não presentes em database.ts (após migration, regenerar tipos). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UntypedAdmin = SupabaseClient<Database> & { from: (relation: string) => any };

export function asUntypedAdmin(client: SupabaseClient<Database>): UntypedAdmin {
  return client as unknown as UntypedAdmin;
}
