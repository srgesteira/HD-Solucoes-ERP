/**
 * Cria (ou promove) um usuário ADMIN no projeto Supabase do ERP HD.
 *
 * Uso (PowerShell, na raiz do projeto):
 *
 *   $env:ADMIN_EMAIL = "voce@exemplo.com"
 *   $env:ADMIN_PASSWORD = "SuaSenhaForte123"
 *   $env:ADMIN_FULL_NAME = "Helder G. Reis"   # opcional
 *   npm run admin:create
 *
 * O script:
 *   1. Cria o usuário em auth.users (com email já confirmado)
 *      — se já existir, apenas atualiza a senha.
 *   2. O trigger handle_new_user cria automaticamente a linha em user_profiles.
 *   3. Promove o profile para role = 'admin'.
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
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const fileEnv = loadEnv();
const url = fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = fileEnv.SUPABASE_SERVICE_ROLE_KEY;

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const fullName = (process.env.ADMIN_FULL_NAME ?? "").trim();

if (!url || !serviceKey) {
  console.error("✗ Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
if (!email || !password) {
  console.error("✗ Defina ADMIN_EMAIL e ADMIN_PASSWORD como variáveis de ambiente.");
  console.error('  Exemplo PowerShell:');
  console.error('    $env:ADMIN_EMAIL = "voce@exemplo.com"');
  console.error('    $env:ADMIN_PASSWORD = "SuaSenhaForte123"');
  console.error('    npm run admin:create');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`→ Criando admin: ${email}`);

let userId = null;

const createRes = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: fullName ? { full_name: fullName } : undefined,
});

if (createRes.error) {
  const msg = createRes.error.message ?? "";
  const isDuplicate = /already (been )?registered|duplicate/i.test(msg);
  if (!isDuplicate) {
    console.error("✗ Falha ao criar:", msg);
    process.exit(1);
  }
  console.log("ℹ Usuário já existe — atualizando senha…");

  let page = 1;
  let found = null;
  while (!found) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (data.users.length < 200) break;
    page += 1;
  }
  if (!found) {
    console.error("✗ Não consegui localizar o usuário existente para atualizar a senha.");
    process.exit(1);
  }
  userId = found.id;

  const upd = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (upd.error) {
    console.error("✗ Falha ao atualizar senha:", upd.error.message);
    process.exit(1);
  }
  console.log("✓ Senha atualizada");
} else {
  userId = createRes.data.user.id;
  console.log(`✓ Usuário criado (id=${userId})`);
}

/** O trigger handle_new_user já criou a linha em user_profiles.
 *  Vamos esperar até 3s para a propagação e então promover para admin. */
let profile = null;
for (let attempt = 0; attempt < 6; attempt++) {
  const { data } = await admin
    .from("user_profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (data) {
    profile = data;
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}

if (!profile) {
  console.warn("⚠ user_profile não foi criado pelo trigger. Forçando insert manual…");
  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", "hd-interna")
    .single();
  await admin.from("user_profiles").insert({
    id: userId,
    tenant_id: tenant.id,
    email,
    full_name: fullName || email.split("@")[0],
    role: "admin",
    is_active: true,
  });
  console.log("✓ user_profile criado manualmente como admin");
} else if (profile.role !== "admin") {
  const { error: updErr } = await admin
    .from("user_profiles")
    .update({
      role: "admin",
      ...(fullName ? { full_name: fullName } : {}),
    })
    .eq("id", userId);
  if (updErr) {
    console.error("✗ Falha ao promover para admin:", updErr.message);
    process.exit(1);
  }
  console.log("✓ Profile promovido para role = admin");
} else {
  console.log("✓ Profile já é admin");
}

console.log("\n✅ Pronto! Use estas credenciais para logar:");
console.log(`   Email: ${email}`);
console.log(`   Senha: (a que você definiu em ADMIN_PASSWORD)`);
console.log("\nAcesse http://localhost:3000/login após rodar `npm run dev`.");
