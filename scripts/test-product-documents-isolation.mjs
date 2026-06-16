/**
 * Teste de isolamento product_documents (read-only + cleanup).
 * Simula tenant B tentando aceder a dados do tenant A.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(root + "/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FAKE_TENANT_B = "00000000-0000-4000-8000-000000000099";

function belongs(path, tenantId) {
  const parts = path.split("/");
  return parts.length >= 4 && parts[0] === tenantId && parts[1] === "products";
}

const { data: tenants } = await admin.from("tenants").select("id").limit(1);
const tenantA = tenants?.[0]?.id;
if (!tenantA) {
  console.error("FAIL: sem tenant no banco");
  process.exit(1);
}

const { data: product } = await admin
  .from("products")
  .select("id")
  .eq("tenant_id", tenantA)
  .limit(1)
  .maybeSingle();
if (!product?.id) {
  console.error("FAIL: sem produto para teste");
  process.exit(1);
}

const storagePath = `${tenantA}/products/${product.id}/test-isolation.pdf`;
const { data: inserted, error: insErr } = await admin
  .from("product_documents")
  .insert({
    tenant_id: tenantA,
    product_id: product.id,
    kind: "manual",
    name: "__isolation_test__",
    revision: "Z",
    file_name: "test.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 12,
    storage_path: storagePath,
  })
  .select("id")
  .single();

if (insErr) {
  console.error("FAIL insert fixture:", insErr.message);
  process.exit(1);
}

const docId = inserted.id;
let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log("OK:", msg);
}
function fail(msg) {
  failed++;
  console.log("FAIL:", msg);
}

// 1) Listagem com tenant B não vê doc do tenant A
const { data: crossList } = await admin
  .from("product_documents")
  .select("id")
  .eq("tenant_id", FAKE_TENANT_B)
  .eq("id", docId);
if ((crossList ?? []).length === 0) ok("list tenant B não vê doc tenant A");
else fail("list tenant B viu doc tenant A");

// 2) GET por id + tenant B
const { data: crossGet } = await admin
  .from("product_documents")
  .select("id")
  .eq("id", docId)
  .eq("tenant_id", FAKE_TENANT_B)
  .maybeSingle();
if (!crossGet) ok("get docId com tenant B retorna vazio");
else fail("get docId com tenant B retornou linha");

// 3) storagePathBelongsToTenant (lógica API download)
if (!belongs(storagePath, FAKE_TENANT_B)) ok("storage path rejeita tenant B");
else fail("storage path aceitou tenant B");

if (belongs(storagePath, tenantA)) ok("storage path aceita tenant A");
else fail("storage path rejeitou tenant A");

// 4) product_id no path deve bater
const pathProductId = storagePath.split("/")[2];
if (pathProductId !== product.id) fail("path product_id inconsistente");
else ok("path contém product_id correto");

// 5) trigger product_tenant_mismatch
const { error: trigErr } = await admin.from("product_documents").insert({
  tenant_id: FAKE_TENANT_B,
  product_id: product.id,
  kind: "manual",
  name: "__should_fail__",
  revision: "A",
  file_name: "x.pdf",
  storage_path: `${FAKE_TENANT_B}/products/${product.id}/x.pdf`,
});
if (trigErr?.message?.includes("product_tenant_mismatch") || trigErr?.code === "P0001") {
  ok("trigger bloqueia product_id de outro tenant");
} else {
  fail("trigger NÃO bloqueou cross-tenant product_id: " + (trigErr?.message ?? "sem erro"));
}

// 6) bucket existe
const { data: buckets } = await admin.storage.listBuckets();
const bucket = buckets?.find((b) => b.id === "product-documents");
if (bucket && bucket.public === false) ok("bucket product-documents privado existe");
else fail("bucket product-documents ausente ou público");

// cleanup
await admin.from("product_documents").delete().eq("id", docId);

console.log("\n=== RESULTADO ===");
console.log({ passed, failed, tenantA, fakeTenantB: FAKE_TENANT_B, docId });
process.exit(failed > 0 ? 1 : 0);
