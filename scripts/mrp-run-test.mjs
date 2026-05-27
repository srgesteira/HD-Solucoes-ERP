import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const text = readFileSync(join(here, "..", ".env.local"), "utf-8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ORDER_ID = "4be4dce3-613a-4cf3-9d1a-ae5ecbf501ad";
const TENANT_ID = "d19658e2-3372-483d-abd0-9e486f945151";

async function main() {
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();

  const userId = profile?.id;
  if (!userId) {
    console.error("Sem user profile no tenant");
    process.exit(1);
  }

  const { processMrpForSalesOrder } = await import("../src/lib/mrp-service.ts");

  console.log("A executar MRP confirm=true...");
  const result = await processMrpForSalesOrder(
    admin,
    TENANT_ID,
    userId,
    ORDER_ID,
    true
  );

  console.log(JSON.stringify(result, null, 2));

  const { data: reqs } = await admin
    .from("purchase_order_items")
    .select("id, product_id, quantity, status, purchase_order_id, trace_key")
    .eq("status", "draft")
    .is("purchase_order_id", null);

  console.log("\n=== Requisições draft após MRP ===");
  console.table(reqs ?? []);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
