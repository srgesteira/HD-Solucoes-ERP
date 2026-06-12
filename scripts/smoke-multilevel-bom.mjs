/**
 * Smoke: propagação multinível MP → SE → acabado (produção).
 * Setup mínimo se a cadeia não existir; altera cost_price da MP e verifica cascata.
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
const admin = createClient(url, serviceKey);

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
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
  const { data: verified, error: vErr } = await auth.auth.verifyOtp({
    email: EMAIL,
    token: String(otp),
    type: "email",
  });
  if (vErr || !verified.session) throw vErr ?? new Error("verifyOtp falhou");
  return verified.session;
}

function cookieHeader(session) {
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  });
  return `sb-ahkxjjrsnwzwicczzvlg-auth-token=${encodeURIComponent(payload)}`;
}

async function getProduct(code) {
  const { data, error } = await admin
    .from("products")
    .select("id, technical_code, cost_price, has_composition")
    .eq("tenant_id", TENANT)
    .eq("technical_code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getBomLine(parentId, componentId) {
  const { data, error } = await admin
    .from("product_components")
    .select("id, unit_cost, quantity")
    .eq("tenant_id", TENANT)
    .eq("parent_product_id", parentId)
    .eq("component_product_id", componentId)
    .eq("is_labor", false)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function apiPutProduct(session, productId, body) {
  const res = await fetch(`${BASE}/api/products/${productId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(session),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function apiPostComponent(session, parentId, payload) {
  const res = await fetch(`${BASE}/api/products/${parentId}/components`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(session),
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function ensureSeBom(session, se, mp) {
  let line = await getBomLine(se.id, mp.id);
  if (line) return line;
  console.log(`Setup: adicionando ${mp.technical_code} na BOM de ${se.technical_code}...`);
  const { status, json } = await apiPostComponent(session, se.id, {
    component_product_id: mp.id,
    quantity: 1,
  });
  if (status !== 201) {
    throw new Error(`POST componente SE falhou: ${status} ${JSON.stringify(json)}`);
  }
  line = await getBomLine(se.id, mp.id);
  return line;
}

async function ensureFinishedUsesSe(session, finished, se) {
  let line = await getBomLine(finished.id, se.id);
  if (line) return line;
  console.log(`Setup: adicionando ${se.technical_code} na BOM de ${finished.technical_code}...`);
  const { status, json } = await apiPostComponent(session, finished.id, {
    component_product_id: se.id,
    quantity: 1,
  });
  if (status !== 201) {
    throw new Error(`POST componente acabado falhou: ${status} ${JSON.stringify(json)}`);
  }
  line = await getBomLine(finished.id, se.id);
  return line;
}

async function main() {
  const session = await getSession();
  console.log(`Sessão: ${EMAIL}\n`);

  const se = await getProduct("SE-H00-001");
  const mp = await getProduct("MP-A10-001");
  const finished = await getProduct("HD1-B20A11-001");

  if (!se || !mp || !finished) {
    throw new Error(
      `Produtos em falta: SE=${!!se} MP=${!!mp} HD1=${!!finished}`
    );
  }

  await ensureSeBom(session, se, mp);
  await ensureFinishedUsesSe(session, finished, se);

  const seFresh = await getProduct("SE-H00-001");
  const mpFresh = await getProduct("MP-A10-001");
  const finFresh = await getProduct("HD1-B20A11-001");

  const seLine = await getBomLine(se.id, mp.id);
  const finLine = await getBomLine(finished.id, se.id);

  console.log("=== Estado antes do PATCH na MP ===");
  console.log(
    `${mp.technical_code} cost_price: ${round4(mpFresh.cost_price)} | BOM SE unit_cost: ${round4(seLine?.unit_cost)}`
  );
  console.log(
    `${se.technical_code} cost_price: ${round4(seFresh.cost_price)} has_composition: ${seFresh.has_composition} | BOM acabado unit_cost: ${round4(finLine?.unit_cost)}`
  );
  console.log(`${finished.technical_code} cost_price: ${round4(finFresh.cost_price)}\n`);

  const prevMp = round4(mpFresh.cost_price);
  const bump = round4(prevMp + 0.15);

  const { status, json } = await apiPutProduct(session, mp.id, {
    cost_price: bump,
  });
  if (status !== 200) {
    throw new Error(`PATCH MP falhou: ${status} ${JSON.stringify(json)}`);
  }
  console.log(`PATCH ${mp.technical_code} cost_price: ${prevMp} → ${bump}\n`);

  const mpAfter = await getProduct("MP-A10-001");
  const seAfter = await getProduct("SE-H00-001");
  const finAfter = await getProduct("HD1-B20A11-001");
  const seLineAfter = await getBomLine(se.id, mp.id);
  const finLineAfter = await getBomLine(finished.id, se.id);

  console.log("=== Depois do PATCH (propagação automática) ===");
  console.log(
    `${mp.technical_code} cost_price: ${round4(mpAfter.cost_price)} | BOM SE unit_cost: ${round4(seLineAfter?.unit_cost)}`
  );
  console.log(
    `${se.technical_code} cost_price: ${round4(seAfter.cost_price)} | BOM acabado unit_cost: ${round4(finLineAfter?.unit_cost)}`
  );
  console.log(`${finished.technical_code} cost_price: ${round4(finAfter.cost_price)}\n`);

  const mpLineOk = round4(seLineAfter?.unit_cost) === bump;
  const seCostUp = round4(seAfter.cost_price) > round4(seFresh.cost_price);
  const finLineOk = round4(finLineAfter?.unit_cost) === round4(seAfter.cost_price);
  const finCostUp = round4(finAfter.cost_price) > round4(finFresh.cost_price);

  console.log(`MP refletida na BOM do SE? ${mpLineOk ? "SIM" : "NÃO"}`);
  console.log(`Custo do SE subiu? ${seCostUp ? "SIM" : "NÃO"}`);
  console.log(`SE refletido na BOM do acabado? ${finLineOk ? "SIM" : "NÃO"}`);
  console.log(`Custo do acabado subiu? ${finCostUp ? "SIM" : "NÃO"}`);

  await apiPutProduct(session, mp.id, { cost_price: prevMp });
  console.log(`\n↩ ${mp.technical_code} revertido para ${prevMp}.`);

  if (!mpLineOk || !seCostUp || !finLineOk || !finCostUp) process.exit(1);
  console.log("\n✅ Smoke multinível MP → SE → acabado passou.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
