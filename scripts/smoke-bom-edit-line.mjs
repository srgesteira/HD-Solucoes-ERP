/**
 * Smoke: editar quantidade de linha BOM (SE Poliol) + propagação para acabado.
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

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
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

async function getSeBomLines(seId) {
  const { data, error } = await admin
    .from("product_components")
    .select(
      "id, quantity, unit_cost, component_product_id, component_product:products!product_components_component_product_id_fkey(technical_code, name)"
    )
    .eq("tenant_id", TENANT)
    .eq("parent_product_id", seId)
    .eq("is_labor", false);
  if (error) throw error;
  return data ?? [];
}

async function getBomLineToParent(parentId, componentId) {
  const { data, error } = await admin
    .from("product_components")
    .select("id, unit_cost, quantity")
    .eq("tenant_id", TENANT)
    .eq("parent_product_id", parentId)
    .eq("component_product_id", componentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function apiPatchComponent(session, parentId, payload) {
  const res = await fetch(`${BASE}/api/products/${parentId}/components`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(session),
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const session = await getSession();
  console.log(`Sessão: ${EMAIL} | BASE: ${BASE}\n`);

  const se = await getProduct("SE-H00-001");
  const finished = await getProduct("HD1-B20A11-001");
  if (!se) throw new Error("SE-H00-001 não encontrado");

  const lines = await getSeBomLines(se.id);
  const poliolLine =
    lines.find((l) => {
      const code = l.component_product?.technical_code ?? "";
      const name = (l.component_product?.name ?? "").toLowerCase();
      return code.includes("POL") || name.includes("poliol");
    }) ?? lines[0];

  if (!poliolLine) {
    throw new Error("Nenhuma linha de material na BOM do SE-H00-001");
  }

  const prevQty = Number(poliolLine.quantity);
  const unitCost = Number(poliolLine.unit_cost);
  const newQty = prevQty === 800 ? 769 : 800;
  const prevSeCost = round2(se.cost_price);
  const prevSubtotal = round2(prevQty * unitCost);
  const expectedSubtotal = round2(newQty * unitCost);
  const expectedSeCost = expectedSubtotal;

  let prevFinCost = null;
  let finLineBefore = null;
  if (finished) {
    prevFinCost = round2(finished.cost_price);
    finLineBefore = await getBomLineToParent(finished.id, se.id);
  }

  console.log("=== Antes do PATCH quantidade ===");
  console.log(
    `Linha: ${poliolLine.component_product?.technical_code ?? "?"} — ${poliolLine.component_product?.name ?? ""}`
  );
  console.log(`Quantidade: ${prevQty} | unit_cost: ${unitCost} | subtotal: ${prevSubtotal}`);
  console.log(`SE cost_price: ${prevSeCost}`);
  if (finished) {
    console.log(
      `Acabado ${finished.technical_code} cost_price: ${prevFinCost} | BOM unit_cost SE: ${finLineBefore?.unit_cost ?? "—"}`
    );
  }
  console.log(`\nPATCH quantidade: ${prevQty} → ${newQty}\n`);

  const { status, json } = await apiPatchComponent(session, se.id, {
    component_id: poliolLine.id,
    quantity: newQty,
  });
  if (status !== 200) {
    throw new Error(`PATCH componente falhou: ${status} ${JSON.stringify(json)}`);
  }

  const seAfter = await getProduct("SE-H00-001");
  const { data: lineAfter } = await admin
    .from("product_components")
    .select("quantity, unit_cost")
    .eq("id", poliolLine.id)
    .single();

  const qtyOk = Number(lineAfter.quantity) === newQty;
  const subtotalAfter = round2(Number(lineAfter.quantity) * Number(lineAfter.unit_cost));
  const seCostAfter = round2(seAfter.cost_price);
  const seCostOk = Math.abs(seCostAfter - expectedSeCost) < 0.05;

  console.log("=== Depois do PATCH ===");
  console.log(`Quantidade gravada: ${lineAfter.quantity} (${qtyOk ? "OK" : "FALHOU"})`);
  console.log(`Subtotal linha: ${subtotalAfter} (esperado ~${expectedSubtotal})`);
  console.log(`SE cost_price: ${seCostAfter} (antes ${prevSeCost}, esperado ~${expectedSeCost})`);

  let finCostUp = false;
  let finLineOk = false;
  if (finished) {
    const finAfter = await getProduct("HD1-B20A11-001");
    const finLineAfter = await getBomLineToParent(finished.id, se.id);
    finCostUp = round2(finAfter.cost_price) > prevFinCost;
    finLineOk =
      Math.abs(round2(finLineAfter?.unit_cost) - seCostAfter) < 0.05;
    console.log(
      `Acabado cost_price: ${round2(finAfter.cost_price)} (antes ${prevFinCost}) subiu? ${finCostUp ? "SIM" : "NÃO"}`
    );
    console.log(
      `BOM acabado unit_cost SE alinhado? ${finLineOk ? "SIM" : "NÃO"} (${finLineAfter?.unit_cost})`
    );
  }

  console.log("\n=== Revertendo quantidade ===");
  await apiPatchComponent(session, se.id, {
    component_id: poliolLine.id,
    quantity: prevQty,
  });
  console.log(`↩ Quantidade revertida para ${prevQty}`);

  const allOk =
    qtyOk &&
    seCostOk &&
    Math.abs(subtotalAfter - expectedSubtotal) < 0.05 &&
    (!finished || (finCostUp && finLineOk));

  if (!allOk) process.exit(1);
  console.log("\n✅ Smoke editar linha BOM passou.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
