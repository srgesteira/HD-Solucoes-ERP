/**
 * Smoke: propagação via API de produção (sessão admin via magic link).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BASE = process.env.SMOKE_BASE_URL ?? "https://hd-solucoes-erp.vercel.app";
const TENANT = process.env.TENANT_ID ?? "d19658e2-3372-483d-abd0-9e486f945151";
const EMAIL = (process.env.SMOKE_USER_EMAIL ?? "helder@hdindustrial.ind.br").trim().toLowerCase();

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function cookieHeader(session) {
  const ref = session.user?.id ?? "ref";
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  });
  const encoded = encodeURIComponent(payload);
  return `sb-ahkxjjrsnwzwicczzvlg-auth-token=${encoded}`;
}

async function getSession() {
  const auth = createClient(url, anonKey);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (linkErr) throw linkErr;
  const otp =
    link.properties?.email_otp ??
    link.properties?.hashed_token ??
    link.properties?.verification_token;
  if (!otp) throw new Error("generateLink não devolveu OTP");

  const { data: verified, error: vErr } = await auth.auth.verifyOtp({
    email: EMAIL,
    token: String(otp),
    type: "email",
  });
  if (vErr || !verified.session) throw vErr ?? new Error("verifyOtp falhou");
  return verified.session;
}

async function main() {
  const session = await getSession();
  console.log(`Sessão OK: ${EMAIL}\n`);

  const { data: mp } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("tenant_id", TENANT)
    .eq("technical_code", "MP-F00-001")
    .single();
  const { data: hd } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("tenant_id", TENANT)
    .eq("technical_code", "HD1-B20A11-001")
    .single();

  const { data: lineBefore } = await admin
    .from("product_components")
    .select("unit_cost, quantity")
    .eq("tenant_id", TENANT)
    .eq("parent_product_id", hd.id)
    .eq("component_product_id", mp.id)
    .maybeSingle();

  console.log("=== Antes (2,50 → 2,60) ===");
  console.log(`MP cost_price: ${round4(mp.cost_price)}`);
  console.log(`HD1 cost_price: ${round4(hd.cost_price)}`);
  console.log(`BOM Pneumática unit_cost: ${round4(lineBefore?.unit_cost)} (qtd ${lineBefore?.quantity})\n`);

  const newCost = 2.6;
  const cookies = cookieHeader(session);
  const res = await fetch(`${BASE}/api/products/${mp.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({ cost_price: newCost }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("PUT falhou:", res.status, JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(`PUT /api/products → ${res.status}\n`);

  const { data: mpAfter } = await admin.from("products").select("cost_price").eq("id", mp.id).single();
  const { data: hdAfter } = await admin.from("products").select("cost_price").eq("id", hd.id).single();
  const { data: lineAfter } = await admin
    .from("product_components")
    .select("unit_cost")
    .eq("tenant_id", TENANT)
    .eq("parent_product_id", hd.id)
    .eq("component_product_id", mp.id)
    .maybeSingle();

  console.log("=== Depois ===");
  console.log(`MP cost_price: ${round4(mpAfter?.cost_price)}`);
  console.log(`HD1 cost_price: ${round4(hdAfter?.cost_price)}`);
  console.log(`BOM Pneumática unit_cost: ${round4(lineAfter?.unit_cost)}`);

  const lineOk = round4(lineAfter?.unit_cost) === newCost;
  const parentDelta = round4(Number(hdAfter?.cost_price) - Number(hd.cost_price));
  const expectedDelta = round4((newCost - round4(mp.cost_price)) * Number(lineBefore?.quantity));
  const parentOk = Math.abs(parentDelta - expectedDelta) < 0.02;

  console.log(`\nLinha = 2,60? ${lineOk ? "SIM" : "NÃO"}`);
  console.log(`Pai subiu ~${expectedDelta}? (real ${parentDelta}) ${parentOk ? "SIM" : "NÃO"}`);

  if (!lineOk || !parentOk) process.exit(1);
  console.log("\n✅ Smoke propagação passou (API produção + BD).");

  // Reverter para 2,50 para não deixar dado de teste
  await fetch(`${BASE}/api/products/${mp.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ cost_price: 2.5 }),
  });
  console.log("↩ Custo MP-F00-001 revertido para 2,50.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
