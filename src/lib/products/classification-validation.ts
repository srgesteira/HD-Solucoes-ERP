import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type ClassificationIds = {
  prefix_id: string;
  family_id: string;
  subfamily_id: string;
  material_id: string;
  finish_id: string;
};

/**
 * Confirma que prefixo, família, subfamília, material e acabamento existem,
 * estão activos e pertencem ao tenant. Subfamília deve pertencer à família indicada.
 */
export async function assertProductClassificationTenant(
  admin: SupabaseClient<Database>,
  tenantId: string,
  ids: ClassificationIds
): Promise<string | null> {
  const { data: p } = await admin
    .from("product_prefixes")
    .select("id")
    .eq("id", ids.prefix_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!p) return "Prefixo inválido ou inactivo para este tenant.";

  const { data: fam } = await admin
    .from("product_families")
    .select("id")
    .eq("id", ids.family_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!fam) return "Família inválida ou inactiva para este tenant.";

  const { data: sf } = await admin
    .from("product_subfamilies")
    .select("id,family_id")
    .eq("id", ids.subfamily_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!sf || sf.family_id !== ids.family_id) {
    return "Sub-família inválida, inactiva ou não pertence à família escolhida.";
  }

  const { data: mat } = await admin
    .from("product_materials")
    .select("id")
    .eq("id", ids.material_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!mat) return "Material inválido ou inactivo para este tenant.";

  const { data: fi } = await admin
    .from("product_finishes")
    .select("id,material_id")
    .eq("id", ids.finish_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!fi) return "Acabamento inválido ou inactivo para este tenant.";

  if (
    fi.material_id != null &&
    fi.material_id !== ids.material_id
  ) {
    return "Este acabamento não corresponde ao material seleccionado.";
  }

  return null;
}
