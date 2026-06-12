/** Read-only: verifica se as views da migration existem no Supabase. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val;
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

for (const v of ["v_product_qty_in_production", "v_product_qty_incoming"]) {
  const { error } = await admin.from(v).select("product_id").limit(1);
  console.log(
    v + ":",
    error ? `NAO EXISTE (${error.message})` : "EXISTE no banco"
  );
}
