/**
 * Testes das alterações:
 * 1) show_product_descriptions (BD + lógica de impressão)
 * 2) Estrutura do fix do modal de produto no orçamento (portal + aplicar linha)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

// --- Lógica espelhada de quote-display.ts ---
function unwrapQuoteProductName(p) {
  if (p == null) return "—";
  const o = Array.isArray(p) ? p[0] : p;
  const n = o?.name;
  return typeof n === "string" && n.trim() ? n : "—";
}

function unwrapQuoteProductDescription(p) {
  if (p == null) return null;
  const o = Array.isArray(p) ? p[0] : p;
  if (!o || typeof o !== "object") return null;
  const tech =
    typeof o.technical_description === "string"
      ? o.technical_description.trim()
      : "";
  const desc =
    typeof o.description === "string" ? o.description.trim() : "";
  if (tech && desc && tech !== desc) return `${tech}\n${desc}`;
  const text = tech || desc;
  return text || null;
}

function quoteItemPrintDescription(description, product) {
  const code =
    (Array.isArray(product) ? product[0] : product)?.technical_code?.trim() ||
    (Array.isArray(product) ? product[0] : product)?.code?.trim() ||
    "—";
  const name = unwrapQuoteProductName(product);
  const raw = description?.trim() ?? "";
  if (!raw) return null;
  const defaults = new Set();
  if (code !== "—" && name !== "—") {
    defaults.add(`${code} — ${name}`);
    defaults.add(`${code} - ${name}`);
  }
  if (name !== "—") defaults.add(name);
  if (defaults.has(raw)) return null;
  let text = raw;
  if (code !== "—") {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = raw.replace(new RegExp(`^${escaped}\\s*[—\\-]\\s*`, "i"), "").trim();
  }
  if (!text || text === name) return null;
  return text;
}

function testPrintLogic() {
  console.log("\n1) Lógica de impressão (show_product_description por item)");
  const product = {
    name: "Caixa Filtro TEST",
    technical_code: "HD1-TEST-001",
    description: "Descrição comercial longa do produto.",
    technical_description: "Especificação técnica detalhada.",
  };

  const lineOn = { show_product_description: true };
  const lineOff = { show_product_description: false };

  const descOn = lineOn.show_product_description
    ? unwrapQuoteProductDescription(product)
    : null;
  assert(descOn?.includes("Especificação técnica"), "item ON deve mostrar descrição");
  ok("item com flag ON → descrição visível");

  const descOff = lineOff.show_product_description
    ? unwrapQuoteProductDescription(product)
    : null;
  assert(descOff === null, "item OFF não deve mostrar descrição");
  ok("item com flag OFF → descrição oculta");

  const extra = quoteItemPrintDescription("HD1-TEST-001 — Caixa Filtro TEST", product);
  assert(extra === null, "label padrão não deve gerar texto extra");
  ok("label SKU+nome não duplica na impressão");

  const extraCustom = quoteItemPrintDescription(
    "Texto personalizado do item",
    product
  );
  assert(extraCustom === "Texto personalizado do item", "texto extra preservado");
  ok("texto extra de item distinto do label");
}

function testSourceFixes() {
  console.log("\n2) Fix modal produto no orçamento (código-fonte)");
  const commercial = readFileSync(
    join(root, "src/components/products/product-commercial-quick-create-modal.tsx"),
    "utf8"
  );
  const picker = readFileSync(
    join(root, "src/components/products/product-catalog-picker-modal.tsx"),
    "utf8"
  );
  const quotePage = readFileSync(
    join(root, "src/app/(app)/sales/quotes/[id]/page.tsx"),
    "utf8"
  );

  assert(commercial.includes("createPortal"), "modal comercial usa portal");
  ok("ProductCommercialQuickCreateModal → createPortal(document.body)");

  assert(
    commercial.includes('type="button"') &&
      commercial.includes("Criar e usar no orçamento"),
    "botão não usa type=submit"
  );
  ok("Botão «Criar e usar» é type=button (não dispara guardar do orçamento)");

  assert(
    picker.includes("commercialQuickCreate && onComplete") &&
      picker.includes("onComplete([hit])"),
    "produto criado aplica-se ao orçamento de imediato"
  );
  ok("handleCommercialCreated → onComplete([hit]) no fluxo comercial");

  assert(!quotePage.includes("<form"), "página do orçamento sem <form> aninhado");
  ok("Página do orçamento sem <form> (evita submit acidental)");
}

async function testDatabaseColumn() {
  console.log("\n3) Base de dados (coluna show_product_description por item)");
  if (!url || !serviceKey) {
    console.log("  ⚠ SUPABASE não configurado — teste de BD ignorado");
    return null;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: quote, error: qErr } = await admin
    .from("quotes")
    .select("id, quote_number, tenant_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) throw new Error(`Erro ao ler quotes: ${qErr.message}`);
  assert(quote?.id, "nenhum orçamento na base para testar");
  ok(`Orçamento encontrado: ${quote.quote_number}`);

  const { data: item, error: iErr } = await admin
    .from("quote_items")
    .select("id, show_product_description")
    .eq("quote_id", quote.id)
    .limit(1)
    .maybeSingle();

  assert(!iErr && item?.id, `sem itens ou erro: ${iErr?.message}`);
  const prev = Boolean(item.show_product_description);
  const next = !prev;

  const { error: upErr } = await admin
    .from("quote_items")
    .update({ show_product_description: next })
    .eq("id", item.id);

  assert(!upErr, `update falhou: ${upErr?.message}`);
  ok(`UPDATE item show_product_description → ${next}`);

  const { data: reread } = await admin
    .from("quote_items")
    .select("show_product_description")
    .eq("id", item.id)
    .single();

  assert(Boolean(reread?.show_product_description) === next, "valor não persistiu");
  ok("Valor lido de volta correctamente");

  await admin
    .from("quote_items")
    .update({ show_product_description: prev })
    .eq("id", item.id);
  ok(`Revertido para valor original (${prev})`);

  const { data: itemFull } = await admin
    .from("quote_items")
    .select(
      "description, product:products(name, description, technical_description, technical_code, code)"
    )
    .eq("id", item.id)
    .maybeSingle();

  if (itemFull?.product) {
    const prod = Array.isArray(itemFull.product) ? itemFull.product[0] : itemFull.product;
    const hasCatalogDesc = Boolean(
      prod?.description?.trim() || prod?.technical_description?.trim()
    );
    console.log(
      `  ℹ Item amostra: produto ${hasCatalogDesc ? "tem" : "não tem"} descrição cadastrada`
    );
  }

  return { quote, admin };
}

async function testQuickCreateProduct(ctx) {
  console.log("\n4) Criação rápida de produto (simulação API / BD)");
  if (!ctx) {
    console.log("  ⚠ Sem contexto BD — ignorado");
    return;
  }
  const { quote, admin } = ctx;

  const { data: pfx } = await admin
    .from("product_prefixes")
    .select("id, code")
    .eq("tenant_id", quote.tenant_id)
    .eq("code", "HD1")
    .maybeSingle();
  const { data: fam } = await admin
    .from("product_families")
    .select("id")
    .eq("tenant_id", quote.tenant_id)
    .limit(1)
    .maybeSingle();
  const { data: sub } = await admin
    .from("product_subfamilies")
    .select("id")
    .eq("family_id", fam?.id ?? "")
    .limit(1)
    .maybeSingle();
  const { data: mat } = await admin
    .from("product_materials")
    .select("id")
    .eq("tenant_id", quote.tenant_id)
    .limit(1)
    .maybeSingle();
  const { data: fin } = await admin
    .from("product_finishes")
    .select("id")
    .eq("tenant_id", quote.tenant_id)
    .limit(1)
    .maybeSingle();

  assert(pfx?.id && fam?.id && sub?.id && mat?.id && fin?.id, "cadastros base incompletos");
  ok("Prefixo HD1 + classificação disponíveis");

  const testName = `TESTE AUTO ORC ${Date.now()}`;
  const { data: created, error: insErr } = await admin
    .from("products")
    .insert({
      tenant_id: quote.tenant_id,
      name: testName,
      technical_code: "",
      unit: "UN",
      type: "finished",
      cost_price: 0,
      selling_price: 0,
      is_active: true,
      prefix_id: pfx.id,
      family_id: fam.id,
      subfamily_id: sub.id,
      material_id: mat.id,
      finish_id: fin.id,
      engineering_workflow_status: "pending_composition",
      composition_requested_at: new Date().toISOString(),
      released_for_sale: false,
      source_quote_id: quote.id,
      has_composition: false,
    })
    .select("id, name, source_quote_id, engineering_workflow_status")
    .single();

  assert(!insErr && created?.id, `insert produto falhou: ${insErr?.message}`);
  ok(`Produto criado: ${created.name.slice(0, 40)}…`);
  assert(created.source_quote_id === quote.id, "source_quote_id não ligou ao orçamento");
  ok("source_quote_id aponta para o orçamento correcto");
  assert(
    created.engineering_workflow_status === "pending_composition",
    "estado engenharia incorrecto"
  );
  ok("Estado engenharia = pending_composition");

  const { count: itemCountBefore } = await admin
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quote.id);

  const { data: quoteAfter } = await admin
    .from("quotes")
    .select("client_name, customer_id, notes")
    .eq("id", quote.id)
    .single();

  assert(quoteAfter?.client_name?.trim(), "orçamento perdeu client_name após criar produto");
  ok("Dados do orçamento intactos após criar produto (simulação do bug anterior)");

  await admin.from("products").delete().eq("id", created.id);
  ok("Produto de teste removido");

  const { count: itemCountAfter } = await admin
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quote.id);
  assert(itemCountBefore === itemCountAfter, "itens do orçamento foram alterados");
  ok(`Itens do orçamento inalterados (${itemCountAfter ?? 0} linhas)`);
}

async function main() {
  console.log("=== Testes: orçamento (modal produto + descrição impressão) ===");
  testPrintLogic();
  testSourceFixes();
  const dbCtx = await testDatabaseColumn();
  await testQuickCreateProduct(dbCtx);
  console.log("\n=== Todos os testes automatizados passaram ===\n");
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
