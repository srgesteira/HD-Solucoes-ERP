import type { UntypedAdmin } from "@/shared/db/supabase/untyped-tables";

/**
 * Feriados que param o tempo útil (tabela `feriados`, tipo = 'feriado').
 * Se a tabela ainda não existir ou der erro, devolve conjunto vazio (conta só seg–sex).
 */
let cache: { quando: number; datas: Set<string> } | null = null;

export async function lerFeriados(db: UntypedAdmin): Promise<Set<string>> {
  if (cache && Date.now() - cache.quando < 10 * 60_000) return cache.datas;
  try {
    const { data, error } = await db.from("feriados").select("data").eq("tipo", "feriado");
    if (error) return new Set();
    const datas = new Set(((data ?? []) as Array<{ data: string }>).map((r) => String(r.data).slice(0, 10)));
    cache = { quando: Date.now(), datas };
    return datas;
  } catch {
    return new Set();
  }
}
