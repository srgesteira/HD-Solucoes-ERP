import {
  currentUserCanMenuModule,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";

/** Admin ou utilizador com módulo Engenharia no menu. */
export async function currentUserCanManageEngineeringProducts(): Promise<boolean> {
  if (await isCurrentUserTenantAdmin()) return true;
  return currentUserCanMenuModule("engenharia");
}

export function meCanManageEngineeringProducts(me: {
  role?: string;
  enabled_modules?: string[];
} | null | undefined): boolean {
  if (!me) return false;
  if (me.role === "admin") return true;
  const mods = me.enabled_modules ?? [];
  return mods.includes("*") || mods.includes("engenharia");
}
