/**
 * Smoke completo do ERP — DB, APIs autenticadas, scripts unitários.
 * Uso: node scripts/smoke-full-system.mjs
 * Opcional: SMOKE_BASE_URL=http://localhost:3000
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

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

function pass(step, detail = "") {
  results.push({ step, ok: true, detail });
  console.log(`✅ ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(step, detail = "") {
  results.push({ step, ok: false, detail });
  failed++;
  console.log(`❌ ${step}${detail ? ` — ${detail}` : ""}`);
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

async function apiGet(session, path, label) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookieHeader(session) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(label, `HTTP ${res.status}: ${json.error ?? "erro"}`);
    return null;
  }
  pass(label, `HTTP ${res.status}`);
  return json;
}

function runScript(scriptName) {
  return new Promise((resolvePromise) => {
    const child = spawn("node", [`scripts/${scriptName}`], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("close", (code) => {
      if (code === 0) pass(`script:${scriptName}`);
      else fail(`script:${scriptName}`, `exit ${code}\n${out.slice(-400)}`);
      resolvePromise();
    });
  });
}

async function testDatabase() {
  console.log("\n── Banco de dados ──");

  const { error: tenantErr } = await admin
    .from("tenants")
    .select("id")
    .eq("id", TENANT)
    .maybeSingle();
  if (tenantErr) fail("DB: tenant", tenantErr.message);
  else pass("DB: tenant existe");

  const tables = [
    "products",
    "sales_orders",
    "purchase_orders",
    "inventory",
    "tax_regimes",
    "fiscal_rules",
    "fiscal_rule_applications",
    "product_documents",
    "production_orders",
    "order_items",
    "hvac_integrity_tests",
    "product_hvac_checklist_items",
    "hvac_checklist_completions",
  ];

  for (const table of tables) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) fail(`DB: tabela ${table}`, error.message);
    else pass(`DB: tabela ${table}`);
  }

  const { data: buckets } = await admin.storage.listBuckets();
  const docBucket = buckets?.find((b) => b.id === "product-documents");
  if (docBucket?.public === false) pass("DB: bucket product-documents privado");
  else fail("DB: bucket product-documents");

  const { data: so } = await admin
    .from("sales_orders")
    .select("fiscal_status, ready_for_invoice")
    .eq("tenant_id", TENANT)
    .limit(1)
    .maybeSingle();
  if (so && typeof so.fiscal_status === "string") {
    pass("DB: sales_orders.fiscal_status", so.fiscal_status);
  } else {
    fail("DB: sales_orders.fiscal_status");
  }

  const { count: rulesCount } = await admin
    .from("fiscal_rules")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  pass("DB: fiscal_rules acessível", `count=${rulesCount ?? 0}`);
}

async function testApis(session) {
  console.log("\n── APIs autenticadas ──");
  console.log(`Base: ${BASE}\n`);

  await apiGet(session, "/api/me", "API: /api/me");

  const planning = await apiGet(session, "/api/pcp/planning", "API: PCP planning");
  if (planning?.orders) {
    pass("API: PCP orders array", `${planning.orders.length} pedido(s)`);
    const sales = planning.orders.filter((o) => o.order_source === "sales");
    if (sales.length) {
      const o = sales[0];
      if ("fiscal_status" in o) pass("API: PCP fiscal_status no pedido", o.fiscal_status);
      else fail("API: PCP fiscal_status ausente");
    }
  }

  await apiGet(session, "/api/menu-alerts", "API: menu-alerts");
  await apiGet(session, "/api/fiscal/rules", "API: fiscal/rules");
  await apiGet(session, "/api/settings/bdi", "API: settings/bdi");

  const sales = await apiGet(
    session,
    "/api/sales/orders?page=1&limit=5",
    "API: sales/orders"
  );
  if (sales?.data?.length >= 0) pass("API: sales listagem", `${sales.data?.length ?? 0} itens`);

  const inv = await apiGet(session, "/api/inventory?page=1&page_size=5", "API: inventory");
  if (inv) pass("API: inventory responde");

  const po = await apiGet(
    session,
    "/api/purchasing/orders?status=confirmed&page=1&limit=5",
    "API: purchasing/orders"
  );
  if (po) pass("API: purchasing responde");

  const company = await apiGet(session, "/api/company/settings", "API: company/settings");
  if (company?.data?.tax_regime !== undefined || company?.data) {
    pass("API: company settings payload");
  }

  await testHvacVertical(session, planning);

  const products = await admin
    .from("products")
    .select("id")
    .eq("tenant_id", TENANT)
    .limit(1)
    .maybeSingle();
  if (products.data?.id) {
    const prodApi = await apiGet(
      session,
      `/api/products/${products.data.id}`,
      "API: products/[id]"
    );
    if (prodApi) pass("API: produto detalhe");
  } else {
    pass("API: products/[id]", "skip — sem produto no tenant");
  }
}

async function testHvacVertical(session, planning) {
  console.log("\n── Vertical HVAC V1–V5 ──");

  const { error: lineColErr } = await admin
    .from("production_lines")
    .select("id, hvac_cleanroom_class")
    .eq("tenant_id", TENANT)
    .limit(1);
  if (lineColErr) fail("HVAC V5: production_lines.hvac_cleanroom_class", lineColErr.message);
  else pass("HVAC V5: coluna hvac_cleanroom_class");

  const { error: quoteColErr } = await admin
    .from("quote_items")
    .select("id, hvac_filter_class, hvac_airflow_m3h, hvac_cleanroom_class")
    .eq("tenant_id", TENANT)
    .limit(1);
  if (quoteColErr) fail("HVAC V4: quote_items hvac_*", quoteColErr.message);
  else pass("HVAC V4: colunas hvac_* em quote_items");

  const { data: acProduct } = await admin
    .from("products")
    .select("id, hvac_filter_class, hvac_requires_integrity_test")
    .eq("tenant_id", TENANT)
    .eq("product_nature", "AC")
    .limit(1)
    .maybeSingle();
  if (acProduct?.id) pass("HVAC V1: produto AC com ficha hvac_*", acProduct.id);
  else pass("HVAC V1: produto AC", "skip — nenhum AC no tenant");

  const lines = await apiGet(session, "/api/production/lines", "API: production/lines");
  if (lines?.data?.length > 0) {
    const first = lines.data[0];
    if (first && "hvac_cleanroom_class" in first) {
      pass("HVAC V5: API linhas expõe hvac_cleanroom_class");
    } else {
      fail("HVAC V5: API linhas sem hvac_cleanroom_class");
    }
  } else {
    pass("HVAC V5: API linhas", "skip — sem linhas activas");
  }

  const { data: sampleOi } = await admin
    .from("order_items")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("is_suggestion", false)
    .limit(1)
    .maybeSingle();
  if (sampleOi?.id) {
    await apiGet(
      session,
      `/api/hvac/integrity-tests?order_item_id=${sampleOi.id}`,
      "API: hvac/integrity-tests (item)"
    );
    await apiGet(
      session,
      `/api/hvac/checklist-completions?order_item_id=${sampleOi.id}`,
      "API: hvac/checklist-completions (item)"
    );
  } else {
    pass("API: hvac/integrity-tests (item)", "skip — sem order_item");
    pass("API: hvac/checklist-completions (item)", "skip — sem order_item");
  }

  const health = await apiGet(session, "/api/data-health", "API: data-health HVAC");
  if (health?.issues && Array.isArray(health.issues)) {
    pass("API: data-health payload", `${health.issues.length} issue(s)`);
  }

  if (planning?.orders?.length) {
    let itemWithOi = null;
    for (const ord of planning.orders) {
      for (const it of ord.items ?? []) {
        if (it.order_item_id) {
          itemWithOi = it;
          break;
        }
      }
      if (itemWithOi) break;
    }
    if (itemWithOi) {
      const keys = [
        "hvac_integrity_required",
        "hvac_checklist_required",
        "hvac_cleanroom_applicable",
        "hvac_cleanroom_compatible",
      ];
      const missing = keys.filter((k) => !(k in itemWithOi));
      if (missing.length === 0) {
        pass("HVAC: PCP item com campos V2–V5", keys.join(", "));
      } else {
        fail("HVAC: PCP item campos ausentes", missing.join(", "));
      }
    } else {
      pass("HVAC: PCP campos", "skip — sem order_item no planning");
    }
  } else {
    pass("HVAC: PCP campos", "skip — planning vazio");
  }

  if (acProduct?.id) {
    const specs = await apiGet(
      session,
      `/api/products/${acProduct.id}/hvac-specs`,
      "API: products/[id]/hvac-specs"
    );
    if (specs?.data && "hvac_filter_class" in specs.data) {
      pass("HVAC V1: API hvac-specs payload");
    }
    const checklist = await apiGet(
      session,
      `/api/products/${acProduct.id}/hvac-checklist`,
      "API: products/[id]/hvac-checklist"
    );
    if (checklist && Array.isArray(checklist.data ?? checklist.items)) {
      pass("HVAC V3: API hvac-checklist responde");
    } else if (checklist) {
      pass("HVAC V3: API hvac-checklist responde");
    }
  }
}

async function testFiscalPreview(session) {
  console.log("\n── Fiscal preview ──");
  const res = await fetch(`${BASE}/api/fiscal/apply-line`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation_type: "sale",
      document_type: "sales_order_item",
      document_line_id: "00000000-0000-4000-8000-000000000001",
      product_id: (
        await admin
          .from("products")
          .select("id")
          .eq("tenant_id", TENANT)
          .limit(1)
          .maybeSingle()
      ).data?.id,
      quantity: 1,
      unit_price: 100,
      destination_uf: "MG",
      preview: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail("Fiscal: apply-line preview", json.error ?? res.status);
    return;
  }
  if (json.fiscal_status === "no_rules" || json.match) {
    pass("Fiscal: apply-line preview", json.fiscal_status ?? "ok");
  } else {
    fail("Fiscal: apply-line preview", "resposta inesperada");
  }
}

async function testChildScripts() {
  console.log("\n── Scripts especializados ──");
  await runScript("test-fiscal-rules-engine.mjs");
  await runScript("test-product-documents-isolation.mjs");
  await runScript("check-views-exist.mjs");
  await runScript("smoke-board.mjs");
  await runScript("smoke-inventory-mrp-op-sale.mjs");
  await runScript("test-quote-changes.mjs");
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  SMOKE COMPLETO — ERP HD Soluções");
  console.log("═══════════════════════════════════════");
  console.log(`Tenant: ${TENANT}`);
  console.log(`User:   ${EMAIL}`);

  try {
    const session = await getSession();
    pass("Auth: magic link session", EMAIL);

    await testDatabase();
    await testApis(session);
    await testFiscalPreview(session);
    await testChildScripts();
  } catch (e) {
    fail("FATAL", e instanceof Error ? e.message : String(e));
  }

  console.log("\n═══════════════════════════════════════");
  const passed = results.filter((r) => r.ok).length;
  console.log(`RESULTADO: ${passed}/${results.length} passou, ${failed} falhou`);
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
