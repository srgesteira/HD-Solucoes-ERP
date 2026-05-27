import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

/** Projeto principal do Kanban — alimenta o Kanban global e o tabuleiro interno. */
export async function getDefaultEpicIdForBoard(
  admin: SupabaseClient<Database>,
  boardId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("epics")
    .select("id")
    .eq("board_id", boardId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}
