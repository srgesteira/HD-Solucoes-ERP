/** Verificação client-side (useMe) — sem imports de servidor. */

export function meCanManageEngineeringProducts(me: {
  role?: string;
  enabled_modules?: string[];
} | null | undefined): boolean {
  if (!me) return false;
  if (me.role === "admin") return true;
  const mods = me.enabled_modules ?? [];
  return mods.includes("*") || mods.includes("engenharia");
}
