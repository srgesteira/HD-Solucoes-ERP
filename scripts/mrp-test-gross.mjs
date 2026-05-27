import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const env = {};
for (const line of readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m) env[m[1]] = m[2].trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = "d19658e2-3372-483d-abd0-9e486f945151";
const productId = "80305bf1-6fa8-46e0-a7ad-d4f57593352e";

const { calculateNeededMaterialsForProductQty, getNetRequirements } = await import(
  "../src/lib/mrp-service.ts"
);

const gross = await calculateNeededMaterialsForProductQty(admin, tenantId, productId, 3);
console.log("Gross:", gross);
const net = await getNetRequirements(admin, tenantId, gross);
console.log(
  "Net shortages:",
  net.filter((n) => n.shortage > 0).map((n) => ({ d: n.description, s: n.shortage }))
);
