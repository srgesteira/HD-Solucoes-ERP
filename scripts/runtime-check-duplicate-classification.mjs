/**
 * Runtime check: origem + families API (mesmo que DevTools no duplicate).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = (process.env.SMOKE_USER_EMAIL ?? "helder@hdindustrial.ind.br").trim().toLowerCase();
const CODES = (process.env.CHECK_CODES ?? "HD1-B20A11-001,MO-A11-001").split(",").map((s) => s.trim());

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val;
    }
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, serviceKey);
const TENANT = "d19658e2-3372-483d-abd0-9e486f945151";

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

async function apiGet(session, path) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { Cookie: cookieHeader(session) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const session = await getSession();
  console.log(`BASE: ${BASE}\n`);

  for (const code of CODES) {
    const { data: row } = await admin
      .from("products")
      .select("id, technical_code, prefix_id, family_id, material_id, finish_id, name")
      .eq("tenant_id", TENANT)
      .eq("technical_code", code)
      .maybeSingle();
    if (!row) {
      console.log(`\n=== ${code} NOT FOUND ===`);
      continue;
    }
    const sourceId = row.id;
    console.log(`\n=== ${code} (sourceId=${sourceId}) ===`);
    console.log(
      "DB/ORIGEM:",
      "family_id:", row.family_id ?? "(null)",
      "| material_id:", row.material_id ?? "(null)",
      "| finish_id:", row.finish_id ?? "(null)",
      "| prefix_id:", row.prefix_id ?? "(null)"
    );

    const prod = await apiGet(session, `/api/products/${sourceId}`);
    console.log(
      "GET /api/products/[id] status:",
      prod.status,
      "| API family_id:",
      prod.json?.data?.family_id ?? "(null)",
      "| material_id:",
      prod.json?.data?.material_id ?? "(null)",
      "| finish_id:",
      prod.json?.data?.finish_id ?? "(null)"
    );

    const prefixId = prod.json?.data?.prefix_id ?? row.prefix_id;
    if (!prefixId) {
      console.log("families: skip (no prefix_id)");
      continue;
    }
    const fam = await apiGet(
      session,
      `/api/products/families?prefix_id=${encodeURIComponent(prefixId)}`
    );
    const list = fam.json?.data ?? [];
    console.log("GET families?prefix_id= status:", fam.status, "| count:", list.length);
    const famMatch = row.family_id
      ? list.find((f) => f.id === row.family_id)
      : null;
    console.log(
      "family_id in list?",
      row.family_id ? (famMatch ? `SIM (${famMatch.code} — ${famMatch.name})` : "NÃO") : "N/A (origem sem family_id)"
    );
    if (list.length > 0 && list.length <= 15) {
      console.log("families items:", list.map((f) => `${f.code} — ${f.name} (${f.id})`).join(" | "));
    } else if (list.length > 15) {
      console.log("families sample (first 5):", list.slice(0, 5).map((f) => `${f.code} — ${f.name}`).join(" | "));
    }

    if (row.material_id) {
      const fin = await apiGet(
        session,
        `/api/products/finishes?material_id=${encodeURIComponent(row.material_id)}`
      );
      const finList = fin.json?.data ?? [];
      const finMatch = row.finish_id
        ? finList.find((f) => f.id === row.finish_id)
        : null;
      console.log("GET finishes?material_id= count:", finList.length, "| finish in list?", finMatch ? `SIM (${finMatch.code})` : row.finish_id ? "NÃO" : "N/A");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
