import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Lê o .env.local sem dependência externa (formato KEY=VALUE simples). */
function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  const text = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

console.log("[check] URL:", url);
console.log("[check] service key prefix:", serviceKey.slice(0, 16) + "...");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("\n=== auth.users ===");
const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 50,
});
if (usersErr) {
  console.error("Erro:", usersErr.message, usersErr.status ?? "");
} else {
  const total = usersData.users.length;
  console.log(`Total: ${total}`);
  for (const u of usersData.users) {
    console.log(`  - ${u.email} | id=${u.id} | confirmed=${u.email_confirmed_at ? "yes" : "NO"}`);
  }
}

console.log("\n=== public.user_profiles ===");
const { data: profiles, error: profErr } = await admin
  .from("user_profiles")
  .select("id, email, full_name, role, is_active, tenant_id");
if (profErr) {
  console.error("Erro:", profErr.message);
} else {
  console.log(`Total: ${profiles.length}`);
  for (const p of profiles) {
    console.log(`  - ${p.email} | role=${p.role} | active=${p.is_active} | full_name=${p.full_name ?? "(null)"}`);
  }
}

console.log("\n=== public.tenants ===");
const { data: tenants } = await admin.from("tenants").select("slug, name");
for (const t of tenants ?? []) {
  console.log(`  - ${t.slug} | ${t.name}`);
}

console.log("\n=== public.boards ===");
const { data: boards } = await admin.from("boards").select("id, name, created_by, created_at");
console.log(`Total: ${(boards ?? []).length}`);
for (const b of boards ?? []) {
  console.log(`  - ${b.name} (id=${b.id})`);
}
