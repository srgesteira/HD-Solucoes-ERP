import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { familyCatalogUsesSharedCompletePrefix } from "@/modules/engenharia/lib/products/family-prefix-scope";
import { SIMPLIFIED_CLASSIFICATION_SUFFIXES } from "@/modules/engenharia/lib/products/prefix-classification";

type Admin = SupabaseClient<Database>;

export type ProductFamilyListItem = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  prefix_id: string | null;
};

const FAMILY_SELECT = "id,code,name,sort_order,prefix_id";
const FAMILY_SELECT_LEGACY = "id,code,name,sort_order";

function sortFamilies(rows: ProductFamilyListItem[]): ProductFamilyListItem[] {
  return [...rows].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.code.localeCompare(b.code)
  );
}

function mergeById(rows: ProductFamilyListItem[]): ProductFamilyListItem[] {
  const map = new Map<string, ProductFamilyListItem>();
  for (const row of rows) map.set(row.id, row);
  return sortFamilies([...map.values()]);
}

async function simplifiedPrefixIds(
  admin: Admin,
  tenantId: string
): Promise<Set<string>> {
  const { data } = await admin
    .from("product_prefixes")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("code", [...SIMPLIFIED_CLASSIFICATION_SUFFIXES]);

  return new Set((data ?? []).map((p) => p.id));
}

/** Catálogo legado: famílias que não pertencem só a MP/SE/… (inclui prefix_id NULL). */
async function listLegacyCompleteFamilies(
  admin: Admin,
  tenantId: string
): Promise<{ data: ProductFamilyListItem[]; error: string | null }> {
  const simplifiedIds = await simplifiedPrefixIds(admin, tenantId);

  const { data: withPrefix, error } = await admin
    .from("product_families")
    .select(FAMILY_SELECT)
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (!error) {
    const rows = (withPrefix ?? []).filter(
      (f) => f.prefix_id == null || !simplifiedIds.has(f.prefix_id)
    ) as ProductFamilyListItem[];
    return { data: sortFamilies(rows), error: null };
  }

  if (!String(error.message).includes("prefix_id")) {
    return { data: [], error: error.message };
  }

  const { data: legacy, error: legacyErr } = await admin
    .from("product_families")
    .select(FAMILY_SELECT_LEGACY)
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (legacyErr) return { data: [], error: legacyErr.message };

  return {
    data: sortFamilies(
      (legacy ?? []).map((f) => ({ ...f, prefix_id: null }))
    ),
    error: null,
  };
}

export async function listProductFamiliesForPrefix(
  admin: Admin,
  tenantId: string,
  prefixId: string,
  prefixCode: string
): Promise<{ data: ProductFamilyListItem[]; error: string | null }> {
  if (!familyCatalogUsesSharedCompletePrefix(prefixCode)) {
    const { data, error } = await admin
      .from("product_families")
      .select(FAMILY_SELECT)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("prefix_id", prefixId)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error) {
      if (String(error.message).includes("prefix_id")) {
        return { data: [], error: "Migração de famílias por sufixo pendente no banco." };
      }
      return { data: [], error: error.message };
    }
    return { data: (data ?? []) as ProductFamilyListItem[], error: null };
  }

  const { data: shared, error: sharedErr } = await admin
    .from("product_families")
    .select(FAMILY_SELECT)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .is("prefix_id", null)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (sharedErr && String(sharedErr.message).includes("prefix_id")) {
    return listLegacyCompleteFamilies(admin, tenantId);
  }
  if (sharedErr) return { data: [], error: sharedErr.message };

  const { data: boundToPrefix } = await admin
    .from("product_families")
    .select(FAMILY_SELECT)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("prefix_id", prefixId);

  let rows = mergeById([
    ...((shared ?? []) as ProductFamilyListItem[]),
    ...((boundToPrefix ?? []) as ProductFamilyListItem[]),
  ]);

  if (rows.length === 0) {
    const legacy = await listLegacyCompleteFamilies(admin, tenantId);
    if (legacy.error) return legacy;
    rows = legacy.data;
  }

  return { data: rows, error: null };
}

/** Valida se a família pertence ao sufixo (inclui catálogo completo partilhado). */
export async function familyBelongsToProductPrefix(
  admin: Admin,
  tenantId: string,
  prefixId: string,
  prefixCode: string,
  familyId: string
): Promise<boolean> {
  const { data } = await listProductFamiliesForPrefix(
    admin,
    tenantId,
    prefixId,
    prefixCode
  );
  return (data ?? []).some((f) => f.id === familyId);
}
