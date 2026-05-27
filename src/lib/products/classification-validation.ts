import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  isCompleteClassificationSuffix,
  isMoClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/lib/products/prefix-classification";

export type ClassificationIds = {
  prefix_id: string;
  family_id: string;
  subfamily_id: string;
  material_id: string;
  finish_id: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** HD1, HD2, HD3, AC: família, subfamília, material e acabamento. */
export function requireCompleteClassificationFields(ids: {
  family_id?: string | null;
  subfamily_id?: string | null;
  material_id?: string | null;
  finish_id?: string | null;
}): string | null {
  const labels = [
    ["family_id", "Família"],
    ["subfamily_id", "Sub-família"],
    ["material_id", "Material"],
    ["finish_id", "Acabamento"],
  ] as const;
  for (const [key, label] of labels) {
    const v = String(ids[key] ?? "").trim();
    if (!v || !UUID_RE.test(v)) {
      return `${label} é obrigatório(a) para este prefixo.`;
    }
  }
  return null;
}

/** MP, SE, EB, MC, RV, MO: material e acabamento. */
export function requireSimplifiedClassificationFields(ids: {
  material_id?: string | null;
  finish_id?: string | null;
}): string | null {
  for (const [key, label] of [
    ["material_id", "Material"],
    ["finish_id", "Acabamento"],
  ] as const) {
    const v = String(ids[key] ?? "").trim();
    if (!v || !UUID_RE.test(v)) {
      return `${label} é obrigatório(a) para este prefixo.`;
    }
  }
  return null;
}

/** @deprecated Use requireSimplifiedClassificationFields */
export function requireMoClassificationFields(ids: {
  material_id?: string | null;
  finish_id?: string | null;
}): string | null {
  return requireSimplifiedClassificationFields(ids);
}

/** @deprecated Use requireCompleteClassificationFields */
export function requireNonMoClassificationFields(ids: {
  family_id?: string | null;
  subfamily_id?: string | null;
  material_id?: string | null;
  finish_id?: string | null;
}): string | null {
  return requireCompleteClassificationFields(ids);
}

/** Valida prefixo simplificado + material + acabamento (sem família/subfamília). */
export async function assertSimplifiedProductClassificationTenant(
  admin: SupabaseClient<Database>,
  tenantId: string,
  ids: {
    prefix_id: string;
    material_id: string;
    finish_id: string;
  }
): Promise<string | null> {
  const { data: p } = await admin
    .from("product_prefixes")
    .select("id,code")
    .eq("id", ids.prefix_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!p) return "Prefixo inválido ou inactivo para este tenant.";
  if (!isSimplifiedClassificationSuffix(p.code)) {
    return "Prefixo seleccionado não usa classificação simplificada (material + acabamento).";
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

  if (fi.material_id != null && fi.material_id !== ids.material_id) {
    return "Este acabamento não corresponde ao material seleccionado.";
  }

  return null;
}

/** @deprecated Use assertSimplifiedProductClassificationTenant */
export async function assertMoProductClassificationTenant(
  admin: SupabaseClient<Database>,
  tenantId: string,
  ids: {
    prefix_id: string;
    material_id: string;
    finish_id: string;
  }
): Promise<string | null> {
  const err = await assertSimplifiedProductClassificationTenant(
    admin,
    tenantId,
    ids
  );
  if (err) return err;

  const { data: p } = await admin
    .from("product_prefixes")
    .select("code")
    .eq("id", ids.prefix_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!isMoClassificationSuffix(p?.code)) {
    return "Prefixo seleccionado não é MO.";
  }
  return null;
}

/**
 * Confirma que prefixo, família, subfamília, material e acabamento existem,
 * estão activos e pertencem ao tenant. Subfamília deve pertencer à família indicada.
 */
export async function assertProductClassificationTenant(
  admin: SupabaseClient<Database>,
  tenantId: string,
  ids: ClassificationIds,
  options?: { skipFamilyMaterial?: boolean }
): Promise<string | null> {
  const { data: p } = await admin
    .from("product_prefixes")
    .select("id,code")
    .eq("id", ids.prefix_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!p) return "Prefixo inválido ou inactivo para este tenant.";
  if (!isCompleteClassificationSuffix(p.code)) {
    return "Prefixo seleccionado não usa classificação completa (família + subfamília + material + acabamento).";
  }

  if (options?.skipFamilyMaterial) {
    return null;
  }

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

  if (fi.material_id != null && fi.material_id !== ids.material_id) {
    return "Este acabamento não corresponde ao material seleccionado.";
  }

  return null;
}
