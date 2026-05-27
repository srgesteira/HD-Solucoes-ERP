import {
  currentUserCanModule,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";

/** Admin, MRP ou produção podem operar APIs de planeamento PCP. */
export async function currentUserCanPcpPlanning(): Promise<boolean> {
  if (await isCurrentUserTenantAdmin()) return true;
  if (await currentUserCanModule("mrp")) return true;
  if (await currentUserCanModule("production")) return true;
  if (await currentUserCanModule("logistics")) return true;
  return false;
}
