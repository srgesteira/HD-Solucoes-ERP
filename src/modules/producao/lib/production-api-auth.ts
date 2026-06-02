import {
  currentUserCanModule,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";

/** Apontamento na linha de produção: admin ou módulo Produção (menu `producao`). */
export async function currentUserCanProductionApontamento(): Promise<boolean> {
  if (await isCurrentUserTenantAdmin()) return true;
  return currentUserCanModule("production");
}
