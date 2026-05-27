import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { publish } from "@/shared/events/bus";
import { registerEventHandlers } from "@/shared/events/register";

type Admin = SupabaseClient<Database>;

/** Persiste em event_log (opcional) e dispara handlers in-process. */
export async function publishEvent(
  admin: Admin,
  eventName: string,
  payload: Record<string, unknown>,
  tenantId: string,
  idempotencyKey?: string
): Promise<{ id: string } | null> {
  registerEventHandlers();

  const row = {
    event_name: eventName,
    payload: { ...payload, _idempotency_key: idempotencyKey ?? null },
    tenant_id: tenantId,
    idempotency_key: idempotencyKey ?? null,
  };

  const db = asUntypedAdmin(admin);
  const { data, error } = await db.from("event_log").insert(row).select("id").single();

  if (error) {
    console.error("[events] event_log insert failed:", eventName, error.message);
  }

  await publish(eventName, payload, tenantId);

  return data ?? null;
}
