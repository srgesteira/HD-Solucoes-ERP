/**
 * Gera link de ativação (/activate) para um e-mail existente.
 * Uso: node scripts/generate-activation-link.mjs gabriel@example.com
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  const text = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function buildActivationLink(origin, hashedToken, type) {
  const params = new URLSearchParams({ token_hash: hashedToken, type });
  return `${origin.replace(/\/$/, "")}/activate?${params.toString()}`;
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: node scripts/generate-activation-link.mjs <email>");
  process.exit(1);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const origin =
  env.NEXT_PUBLIC_APP_URL?.trim() || "https://hd-solucoes-erp.vercel.app";
const redirectTo = `${origin.replace(/\/$/, "")}/auth/callback`;

if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const user = list?.users?.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  console.error(`Utilizador não encontrado: ${email}`);
  process.exit(1);
}

console.log("Utilizador:", user.id);
console.log("  invited_at:", user.invited_at ?? "(null)");
console.log("  confirmed_at:", user.confirmed_at ?? user.email_confirmed_at ?? "(null)");
console.log("  last_sign_in_at:", user.last_sign_in_at ?? "(null)");

const { data: profile } = await admin
  .from("user_profiles")
  .select("tenant_id, enabled_modules, role_keys, full_name")
  .eq("id", user.id)
  .maybeSingle();

const metadata = {
  tenant_id: profile?.tenant_id ?? null,
  admin_all: (profile?.enabled_modules ?? []).includes("*"),
  enabled_modules: profile?.enabled_modules ?? [],
  role_key: profile?.role_keys?.[0] ?? null,
  full_name: profile?.full_name ?? null,
  must_set_password: true,
};

async function tryLink(type) {
  return admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo, data: metadata },
  });
}

let linkType = "invite";
let result = await tryLink("invite");
if (result.error || !result.data?.properties?.hashed_token) {
  linkType = "recovery";
  result = await tryLink("recovery");
}

const hashed = result.data?.properties?.hashed_token;
if (result.error || !hashed) {
  console.error("Erro:", result.error?.message ?? "sem hashed_token");
  process.exit(1);
}

await admin.auth.admin.updateUserById(user.id, {
  user_metadata: { ...metadata, must_set_password: true },
});

const activationLink = buildActivationLink(origin, hashed, linkType);
console.log("\nTipo de link:", linkType);
console.log("must_set_password=true gravado no user_metadata");
console.log("\n=== LINK DE ATIVAÇÃO (copiar) ===\n");
console.log(activationLink);
console.log("");
