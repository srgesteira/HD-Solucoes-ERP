/**
 * Diagnóstico: POST /api/purchasing/suppliers (mesmo endpoint do modal).
 * Uso: node scripts/probe-supplier-post.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BASE = process.env.SMOKE_BASE_URL ?? "https://hd-solucoes-erp.vercel.app";
const EMAIL = (process.env.SMOKE_USER_EMAIL ?? "helder@hdindustrial.ind.br").trim().toLowerCase();

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Faltam variáveis Supabase no .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey);

async function getSession(email) {
  const auth = createClient(url, anonKey);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const otp =
    link.properties?.email_otp ??
    link.properties?.hashed_token ??
    link.properties?.verification_token;
  const { data: verified, error: vErr } = await auth.auth.verifyOtp({
    email,
    token: String(otp),
    type: "email",
  });
  if (vErr || !verified.session) throw vErr ?? new Error("verifyOtp falhou");
  return verified.session;
}

function cookieHeader(session) {
  const ref = new URL(url).hostname.split(".")[0];
  const key = `sb-${ref}-auth-token`;
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  });
  return `${key}=${encodeURIComponent(payload)}`;
}

async function probe(email, payload, label) {
  const session = await getSession(email);
  const cookie = cookieHeader(session);

  const meRes = await fetch(`${BASE}/api/me`, {
    headers: { Cookie: cookie },
  });
  const me = await meRes.json().catch(() => ({}));
  console.log(`\n=== ${label} (${email}) ===`);
  console.log("role:", me?.role ?? me?.data?.role ?? "?");

  const res = await fetch(`${BASE}/api/purchasing/suppliers`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  console.log("POST status:", res.status);
  console.log("POST body:", JSON.stringify(body, null, 2));
  return { status: res.status, body };
}

const unique = Date.now().toString(36).toUpperCase();
const modalLikePayload = {
  code: `F9999999${unique.slice(-4)}`.slice(0, 12),
  name: `Fornecedor Teste Diagnóstico ${unique}`,
  document: "12.345.678/0001-99",
  is_active: true,
};

const helder = await probe(EMAIL, modalLikePayload, "helder (admin esperado)");

// Segundo POST com mesmo código → deve ser 409 se o primeiro foi 201
if (helder.status === 201) {
  await probe(EMAIL, modalLikePayload, "helder repete mesmo código (espera 409)");
}

// Utilizador não-admin se existir
const { data: profiles } = await admin
  .from("user_profiles")
  .select("id, role, email:auth.users(email)")
  .neq("role", "admin")
  .limit(5);

// list users another way
const { data: users } = await admin.auth.admin.listUsers({ perPage: 50 });
const nonAdmin = (users?.users ?? []).filter((u) => {
  const p = u.user_metadata;
  return u.email && u.email !== EMAIL;
});

for (const u of nonAdmin.slice(0, 3)) {
  const { data: prof } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", u.id)
    .maybeSingle();
  if (prof?.role === "admin") continue;
  try {
    await probe(
      u.email,
      {
        ...modalLikePayload,
        code: `F8888888${unique.slice(-4)}`.slice(0, 12),
        name: `Teste non-admin ${unique}`,
      },
      `non-admin: ${u.email} (role=${prof?.role ?? "?"})`
    );
    break;
  } catch (e) {
    console.log("skip", u.email, e.message);
  }
}
