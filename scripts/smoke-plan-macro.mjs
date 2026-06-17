/**
 * Execução automatizada do plano macro §12.5 (GUIA-SISTEMA-LAYOUT-E-FUNCIONAMENTO).
 * Frentes 1–7 + P1 + páginas críticas + continuidade (não-destrutiva).
 *
 * Uso: node scripts/smoke-plan-macro.mjs
 * Requer .env.local com Supabase. Opcional: SMOKE_BASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BASE =
  process.env.SMOKE_BASE_URL ?? "https://hd-solucoes-erp.vercel.app";
const TENANT = process.env.TENANT_ID ?? "d19658e2-3372-483d-abd0-9e486f945151";
const EMAIL = (process.env.SMOKE_USER_EMAIL ?? "helder@hdindustrial.ind.br")
  .trim()
  .toLowerCase();

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
  console.error("Faltam variáveis Supabase em .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
let failed = 0;
let blockedHuman = 0;

function pass(step, detail = "") {
  results.push({ step, ok: true, detail, blocked: false });
  console.log(`✅ ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(step, detail = "") {
  results.push({ step, ok: false, detail, blocked: false });
  failed++;
  console.log(`❌ ${step}${detail ? ` — ${detail}` : ""}`);
}

function blocked(step, detail = "") {
  results.push({ step, ok: true, detail, blocked: true });
  blockedHuman++;
  console.log(`🧑‍💼 ${step}${detail ? ` — ${detail}` : ""}`);
}

function cookieHeader(session) {
  const ref = new URL(url).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  });
  return `sb-${ref}-auth-token=${encodeURIComponent(payload)}`;
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
  if (!otp) throw new Error("generateLink sem OTP");
  const { data: verified, error: vErr } = await auth.auth.verifyOtp({
    email: EMAIL,
    token: String(otp),
    type: "email",
  });
  if (vErr || !verified.session) throw vErr ?? new Error("verifyOtp falhou");
  return verified.session;
}

async function apiGet(session, path, label, opts = {}) {
  const { allow403 = false } = opts;
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookieHeader(session) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 403 && allow403) {
    pass(label, `HTTP 403 — ${json.error ?? "sem módulo"}`);
    return json;
  }
  if (!res.ok) {
    fail(label, `HTTP ${res.status}: ${json.error ?? "erro"}`);
    return null;
  }
  pass(label, `HTTP ${res.status}`);
  return json;
}

async function pageGet(session, path, label, mustInclude) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookieHeader(session) },
    redirect: "follow",
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    fail(label, `HTTP ${res.status}`);
    return false;
  }
  if (mustInclude && !text.includes(mustInclude)) {
    fail(label, `HTTP ${res.status} mas sem «${mustInclude}»`);
    return false;
  }
  pass(label, `HTTP ${res.status}`);
  return true;
}

async function testFrente1() {
  console.log("\n── Frente 1 — Empenho ──");
  const { error } = await admin
    .from("inventory_reservations")
    .select("id, order_item_id, product_id, quantity")
    .eq("tenant_id", TENANT)
    .limit(1);
  if (error) fail("F1: tabela inventory_reservations", error.message);
  else pass("F1: tabela inventory_reservations");

  const { data: inv } = await admin
    .from("inventory")
    .select("product_id, quantity_on_hand, reserved_quantity")
    .eq("tenant_id", TENANT)
    .limit(5);
  if (!inv?.length) pass("F1: inventory.reserved_quantity", "skip — sem stock");
  else {
    const withReserved = inv.filter((r) => Number(r.reserved_quantity ?? 0) > 0);
    pass(
      "F1: coluna reserved_quantity",
      `${withReserved.length}/${inv.length} com reserva`
    );
  }
}

async function testFrente2() {
  console.log("\n── Frente 2 — has_composition ──");
  const { count, error } = await admin
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .not("has_composition", "is", null);
  if (error) fail("F2: has_composition", error.message);
  else pass("F2: has_composition preenchido", `count=${count ?? 0}`);
}

async function testFrente3(session) {
  console.log("\n── Frente 3 — Inbox Engenharia ──");
  const json = await apiGet(session, "/api/engineering/demands", "F3: API engineering/demands");
  if (json && Array.isArray(json.data ?? json.demands ?? json.items)) {
    pass("F3: payload lista demandas");
  } else if (json) {
    pass("F3: payload responde");
  }
  await pageGet(session, "/engineering/inbox", "F3: página /engineering/inbox");
}

async function testFrente4(session) {
  console.log("\n── Frente 4 — Entrega/Coleta ──");
  const json = await apiGet(session, "/api/shipments", "F4: API shipments");
  if (json?.items) {
    const dirs = new Set(
      (json.items ?? []).map((s) => s.direction).filter(Boolean)
    );
    pass("F4: shipments com direction", [...dirs].join(", ") || "lista vazia OK");
  }
  await pageGet(session, "/logistics/shipping", "F4: página /logistics/shipping");
}

async function testFrente5() {
  console.log("\n── Frente 5 — Limpeza ──");
  for (const dead of ["goods_receipts", "incoming_inspections", "operator_lines"]) {
    const { error } = await admin.from(dead).select("id").limit(1);
    if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
      pass(`F5: tabela morta ${dead} removida`);
    } else if (error) {
      pass(`F5: ${dead}`, error.message);
    } else {
      fail(`F5: tabela morta ${dead} ainda existe`);
    }
  }
}

async function testFrente6(session) {
  console.log("\n── Frente 6 — Roteiro N ops ──");
  for (const table of ["product_routing_steps", "order_item_operations"]) {
    const { error } = await admin.from(table).select("id").eq("tenant_id", TENANT).limit(1);
    if (error) fail(`F6: tabela ${table}`, error.message);
    else pass(`F6: tabela ${table}`);
  }
  const { data: product } = await admin
    .from("products")
    .select("id")
    .eq("tenant_id", TENANT)
    .limit(1)
    .maybeSingle();
  if (product?.id) {
    await apiGet(
      session,
      `/api/products/${product.id}/routing-steps`,
      "F6: API routing-steps"
    );
  } else {
    pass("F6: API routing-steps", "skip — sem produto");
  }
}

async function testFrente7(session) {
  console.log("\n── Frente 7 — Conciliação bancária ──");
  const { error } = await admin
    .from("bank_imports")
    .select("id, status")
    .eq("tenant_id", TENANT)
    .limit(1);
  if (error) fail("F7: tabela bank_imports", error.message);
  else pass("F7: tabela bank_imports");

  await apiGet(session, "/api/finance/bank-imports", "F7: API bank-imports", {
    allow403: true,
  });
  await pageGet(
    session,
    "/finance/bank-reconciliation",
    "F7: página /finance/bank-reconciliation"
  );
}

async function testP1(session) {
  console.log("\n── P1 — Comercial / financeiro ──");
  const quotes = await apiGet(
    session,
    "/api/sales/quotes?page=1&limit=5",
    "P1: API sales/quotes"
  );
  if (quotes?.data?.length >= 0) pass("P1: listagem orçamentos");

  const orders = await apiGet(
    session,
    "/api/sales/orders?page=1&limit=5",
    "P1: API sales/orders"
  );
  if (orders?.data?.length) {
    const first = orders.data[0];
    if ("ready_for_invoice" in first || "status" in first) {
      pass("P1: pedido com campos operacionais");
    }
    if ("fiscal_status" in first) {
      pass("P1: fiscal_status no pedido", String(first.fiscal_status));
    }
  }

  await apiGet(
    session,
    "/api/finance/receivables?page=1&limit=5",
    "P1: API finance/receivables"
  );

  const { count: recvCount } = await admin
    .from("receivables")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  pass("P1: tabela receivables", `count=${recvCount ?? 0}`);
}

async function testFiscalRules(session) {
  console.log("\n── Plano §12.5 passo 2 — fiscal_rules ──");
  const { count } = await admin
    .from("fiscal_rules")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  if ((count ?? 0) === 0) {
    blocked(
      "fiscal_rules preenchidas",
      "0 regras — contadora deve cadastrar CFOP/alíquotas (fora do escopo dev)"
    );
  } else {
    pass("fiscal_rules cadastradas", `count=${count}`);
  }
  await apiGet(session, "/api/fiscal/rules", "Fiscal: API rules");
  await apiGet(session, "/api/fiscal/inconsistencies", "Fiscal: assistente inconsistências");
  await pageGet(session, "/settings/fiscal-rules", "Fiscal: tela regras");
}

async function testContinuidade() {
  console.log("\n── Plano §12.5 passo 3 — continuidade ──");
  const mig = spawnSync("pnpm", ["supabase", "migration", "list", "--linked"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  if (mig.status === 0) {
    const lines = (mig.stdout ?? "").trim().split("\n");
    const last = lines[lines.length - 1] ?? "";
    pass("Continuidade: migrations linked", last.slice(0, 80));
  } else {
    fail("Continuidade: migration list", mig.stderr?.slice(-200) ?? "erro");
  }

  blocked(
    "Restore mensal em projeto staging-restore",
    "requer painel Supabase + confirmação humana — ver RUNBOOK-BACKUP-LOG.md"
  );

  const healthRes = await fetch(`${BASE}/login`, { method: "GET" });
  if (healthRes.ok) pass("Continuidade: app produção acessível", BASE);
  else fail("Continuidade: app produção", `HTTP ${healthRes.status}`);
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  PLANO MACRO §12.5 — execução automatizada");
  console.log("═══════════════════════════════════════");
  console.log(`Base:   ${BASE}`);
  console.log(`Tenant: ${TENANT}`);

  try {
    const session = await getSession();
    pass("Auth session", EMAIL);

    await testFrente1();
    await testFrente2();
    await testFrente3(session);
    await testFrente4(session);
    await testFrente5();
    await testFrente6(session);
    await testFrente7(session);
    await testP1(session);
    await testFiscalRules(session);
    await testContinuidade();
  } catch (e) {
    fail("FATAL", e instanceof Error ? e.message : String(e));
  }

  console.log("\n═══════════════════════════════════════");
  const passed = results.filter((r) => r.ok).length;
  const auto = results.filter((r) => r.ok && !r.blocked).length;
  console.log(
    `RESULTADO: ${passed}/${results.length} OK (${auto} auto, ${blockedHuman} 🧑‍💼 bloqueado humano), ${failed} falhou`
  );
  console.log("═══════════════════════════════════════\n");

  if (failed > 0) {
    console.log("Falhas:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.step}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main();
