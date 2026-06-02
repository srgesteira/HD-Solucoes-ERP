import {
  currentUserCanModule,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";

/** Bloquear/liberar finalização na linha: admin ou módulo Qualidade. */
export async function currentUserCanQualityFinishControl(): Promise<boolean> {
  if (await isCurrentUserTenantAdmin()) return true;
  return currentUserCanModule("quality");
}
