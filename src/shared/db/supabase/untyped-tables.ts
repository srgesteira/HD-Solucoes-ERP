import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

/** Cliente com tabelas/funções ainda não presentes em database.ts (após migration, regenerar tipos). */
export type UntypedAdmin = Omit<SupabaseClient<Database>, "from" | "rpc"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (relation: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export function asUntypedAdmin(client: SupabaseClient<Database>): UntypedAdmin {
  return client as unknown as UntypedAdmin;
}
