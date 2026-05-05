/**
 * Smoke test: cria um quadro com colunas (igual à API), valida membership,
 * remove tudo. Não depende do navegador.
 *
 * npm run test:smoke
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_COLUMNS = [
  { name: "A Fazer", color: "#64748b", sort_order: 1000 },
  { name: "Em Andamento", color: "#0d9488", sort_order: 2000 },
  { name: "Concluído", color: "#16a34a", sort_order: 3000 },
];

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
const email =
  (process.env.SMOKE_USER_EMAIL ?? "helder@hdindustrial.ind.br")
    .trim()
    .toLowerCase();

if (!url || !serviceKey) {
  console.error("✗ Falta .env.local (URL / SERVICE_ROLE)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("→ Buscando usuário:", email);

let userId = null;
let page = 1;
while (!userId) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) {
    console.error("✗", error.message);
    process.exit(1);
  }
  const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (u) userId = u.id;
  if (!data.users.length || data.users.length < 200) break;
  page += 1;
}
if (!userId) {
  console.error("✗ Usuário não encontrado no Auth. Rode: npm run admin:create");
  process.exit(1);
}

const { data: profile, error: pErr } = await admin
  .from("user_profiles")
  .select("tenant_id")
  .eq("id", userId)
  .single();
if (pErr || !profile) {
  console.error("✗ Perfil não encontrado:", pErr?.message);
  process.exit(1);
}

const testName = `__smoke_${Date.now()}`;
console.log("→ Criando quadro de teste:", testName);

const { data: board, error: bErr } = await admin
  .from("boards")
  .insert({
    tenant_id: profile.tenant_id,
    name: testName,
    description: "smoke test",
    color: "#0f766e",
    created_by: userId,
  })
  .select("id")
  .single();

if (bErr || !board) {
  console.error("✗ Insert boards:", bErr?.message);
  process.exit(1);
}

const { error: cErr } = await admin.from("board_columns").insert(
  DEFAULT_COLUMNS.map((c) => ({
    board_id: board.id,
    name: c.name,
    color: c.color,
    sort_order: c.sort_order,
  }))
);
if (cErr) {
  await admin.from("boards").delete().eq("id", board.id);
  console.error("✗ Insert columns:", cErr.message);
  process.exit(1);
}

const { data: member, error: mErr } = await admin
  .from("board_members")
  .select("role")
  .eq("board_id", board.id)
  .eq("user_id", userId)
  .maybeSingle();

if (mErr || !member || member.role !== "owner") {
  console.error("✗ Membership owner não encontrada:", mErr?.message);
  process.exit(1);
}

console.log("✓ Quadro + colunas + owner OK (id=" + board.id + ")");

await admin.from("boards").delete().eq("id", board.id);
console.log("✓ Quadro de teste removido");

console.log("\n✅ Smoke test passou — pode testar no navegador: /boards/new");
