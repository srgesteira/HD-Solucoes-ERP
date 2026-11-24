import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { resolveLaborHourlyRateForBom } from "@/modules/rh/lib/labor-cost-utils";
import { recalculateProductCost } from "@/modules/engenharia/lib/products/recalculate-product-cost";
import { propagateComponentCostChange } from "@/modules/engenharia/lib/products/propagate-component-cost";
import { syncProductHasCompositionFromBom } from "@/modules/engenharia/lib/products/sync-has-composition";
import {
  canProductHaveBom,
  canToggleComposition,
  isSemiFinishedPrefix,
} from "@/modules/engenharia/lib/products/product-bom-eligibility";
import { comLogDoRobo, hashToken, TOKEN_PREFIX } from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Robô Compositor — monta a composição (BOM) do produto no ERP a partir da lista de peças do Desenhista.
 * Autorização: Bearer (token do robô ou AGENT_API_KEY), ou sessão de administrador.
 * Só mexe no cadastro interno; não manda nada para fora. Preço de venda continua com o Helder.
 *
 * GET ?busca=chapa 1,2     → até 30 produtos ativos por código/nome (id, código, nome, unidade, prefixo, custo).
 * GET ?produto=HD1-...     → produto + composição atual.
 * POST { acao: "montar",
 *        produto: { codigo } | { base_codigo, nome, descricao? },   // base = copia a classificação (prefixo, família…)
 *        linhas: [{ codigo, quantidade, custo_unitario? }],          // MO pelo cadastro (prefixo MO); "MO externa avulsa": { mo_externa: "descrição", quantidade, custo_unitario }
 *        substituir?: boolean,                                       // só troca uma composição existente se true
 *        simular?: boolean }                                         // calcula sem gravar
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Db = ReturnType<typeof asUntypedAdmin>;

type Prod = {
  id: string;
  technical_code: string | null;
  name: string;
  unit: string | null;
  cost_price: number | null;
  is_active: boolean | null;
  composition_enabled: boolean | null;
  has_composition: boolean | null;
  default_is_external_labor: boolean | null;
  default_work_center_id: string | null;
  default_production_line_id: string | null;
  prefix_id: string | null;
  family_id: string | null;
  subfamily_id: string | null;
  material_id: string | null;
  finish_id: string | null;
  ncm: string | null;
  type: string | null;
  product_nature: string | null;
  prefix: { code?: string } | null;
};

const PROD_COLS =
  "id, technical_code, name, unit, cost_price, is_active, composition_enabled, has_composition, default_is_external_labor, default_work_center_id, default_production_line_id, prefix_id, family_id, subfamily_id, material_id, finish_id, ncm, type, product_nature, prefix:product_prefixes!products_prefix_id_fkey(code)";

async function resolver(request: NextRequest, admin: Admin): Promise<{ tenant: string } | NextResponse> {
  const sent = (request.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
  if (sent) {
    const key = (process.env.AGENT_API_KEY ?? "").trim();
    const db = asUntypedAdmin(admin);
    let tenant: string | null = null;
    if (sent.startsWith(TOKEN_PREFIX)) {
      const { data } = await db
        .from("agents")
        .select("tenant_id, status")
        .eq("token_hash", hashToken(sent))
        .maybeSingle();
      const a = data as { tenant_id?: string; status?: string } | null;
      if (a?.tenant_id && a.status === "ativo") tenant = a.tenant_id;
    }
    if (!tenant && key && sent === key) {
      const { data } = await admin.from("tenants").select("id").limit(1);
      tenant = data?.[0]?.id ?? null;
    }
    if (!tenant) return apiError("Não autorizado", 401);
    return { tenant };
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
  const tenant = await getCurrentTenantId();
  if (!tenant) return apiError("Tenant não encontrado", 403);
  return { tenant };
}

async function porCodigo(db: Db, tenant: string, codigo: string): Promise<Prod | null> {
  const c = codigo.trim();
  const { data } = await db.from("products").select(PROD_COLS).eq("tenant_id", tenant).ilike("technical_code", c).limit(2);
  const rows = (data ?? []) as Prod[];
  return rows.length === 1 ? rows[0] : null;
}

function pref(p: Prod): string {
  return String(p.prefix?.code ?? "").trim().toUpperCase();
}

async function getHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const quem = await resolver(request, admin);
  if (quem instanceof NextResponse) return quem;
  const db = asUntypedAdmin(admin);
  const url = new URL(request.url);

  const produto = url.searchParams.get("produto");
  if (produto) {
    const p = await porCodigo(db, quem.tenant, produto);
    if (!p) return apiError(`Produto ${produto} não encontrado (ou código repetido).`, 404);
    const { data: linhas } = await db
      .from("product_components")
      .select("quantity, unit_cost, is_labor, is_external_labor, component:products!product_components_component_product_id_fkey(technical_code, name, unit)")
      .eq("tenant_id", quem.tenant)
      .eq("parent_product_id", p.id);
    return apiOk({
      produto: { codigo: p.technical_code, nome: p.name, prefixo: pref(p), custo: Number(p.cost_price ?? 0) },
      composicao: linhas ?? [],
    });
  }

  const busca = (url.searchParams.get("busca") ?? "").trim();
  if (!busca) return apiError("Informe ?busca= ou ?produto=", 400);
  const termos = busca.split(/\s+/).filter(Boolean).slice(0, 5);
  let q = db.from("products").select(PROD_COLS).eq("tenant_id", quem.tenant).eq("is_active", true);
  for (const t of termos) {
    const s = t.replace(/[%,()]/g, "");
    q = q.or(`technical_code.ilike.%${s}%,name.ilike.%${s}%`);
  }
  const { data, error } = await q.order("technical_code").limit(30);
  if (error) return apiError(error.message, 500);
  return apiOk({
    itens: ((data ?? []) as Prod[]).map((p) => ({
      codigo: p.technical_code,
      nome: p.name,
      unidade: p.unit,
      prefixo: pref(p),
      custo: Number(p.cost_price ?? 0),
      mo_externa: p.default_is_external_labor === true,
    })),
  });
}

type LinhaIn = { codigo?: string; quantidade?: number; custo_unitario?: number; mo_externa?: string };
type LinhaOk = {
  component_product_id: string | null;
  quantity: number;
  unit_cost: number;
  is_labor: boolean;
  is_external_labor: boolean;
  work_center_id: string | null;
  resumo: string;
};

async function prepararLinhas(admin: Admin, db: Db, tenant: string, linhas: LinhaIn[]): Promise<LinhaOk[] | string> {
  const out: LinhaOk[] = [];
  for (const [i, l] of linhas.entries()) {
    const qtd = Number(l.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) return `Linha ${i + 1}: quantidade inválida.`;

    if (l.mo_externa && !l.codigo) {
      const custo = Number(l.custo_unitario);
      if (!Number.isFinite(custo) || custo < 0) return `Linha ${i + 1}: MO externa avulsa precisa de custo_unitario.`;
      out.push({ component_product_id: null, quantity: qtd, unit_cost: custo, is_labor: true, is_external_labor: true, work_center_id: null, resumo: `MO externa: ${l.mo_externa}` });
      continue;
    }

    if (!l.codigo) return `Linha ${i + 1}: falta o código do produto.`;
    const p = await porCodigo(db, tenant, l.codigo);
    if (!p) return `Linha ${i + 1}: produto ${l.codigo} não encontrado (ou código repetido).`;
    const custoCad = Number(p.cost_price ?? 0);

    if (pref(p) === "MO") {
      if (p.default_is_external_labor) {
        out.push({ component_product_id: p.id, quantity: qtd, unit_cost: custoCad, is_labor: true, is_external_labor: true, work_center_id: null, resumo: `${p.technical_code} ${p.name}` });
      } else {
        const wc = p.default_work_center_id;
        if (!wc) return `Linha ${i + 1}: MO interna ${p.technical_code} sem centro de trabalho padrão no cadastro.`;
        const custo =
          custoCad > 0
            ? custoCad
            : await resolveLaborHourlyRateForBom(admin, tenant, { work_center_id: wc, production_line_id: p.default_production_line_id });
        out.push({ component_product_id: p.id, quantity: qtd, unit_cost: custo, is_labor: true, is_external_labor: false, work_center_id: wc, resumo: `${p.technical_code} ${p.name}` });
      }
      continue;
    }

    out.push({ component_product_id: p.id, quantity: qtd, unit_cost: custoCad, is_labor: false, is_external_labor: false, work_center_id: null, resumo: `${p.technical_code} ${p.name}` });
  }
  return out;
}

async function postHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const quem = await resolver(request, admin);
  if (quem instanceof NextResponse) return quem;
  const db = asUntypedAdmin(admin);
  const tenant = quem.tenant;

  let body: {
    acao?: string;
    produto?: { codigo?: string; base_codigo?: string; nome?: string; descricao?: string };
    linhas?: LinhaIn[];
    substituir?: boolean;
    simular?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (body.acao !== "montar") return apiError('Use acao: "montar".', 400);
  const linhasIn = Array.isArray(body.linhas) ? body.linhas : [];
  if (!linhasIn.length) return apiError("Sem linhas de composição.", 400);
  if (linhasIn.length > 200) return apiError("Mais de 200 linhas — divida em semi-elaborados.", 400);

  const linhas = await prepararLinhas(admin, db, tenant, linhasIn);
  if (typeof linhas === "string") return apiError(linhas, 400);
  const custoPrevisto = linhas.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  // Produto pai: existente ou novo copiando a classificação de um produto base.
  const pin = body.produto ?? {};
  let pai: Prod | null = null;
  let base: Prod | null = null;
  if (pin.codigo) {
    pai = await porCodigo(db, tenant, pin.codigo);
    if (!pai) return apiError(`Produto ${pin.codigo} não encontrado (ou código repetido).`, 404);
  } else {
    if (!pin.base_codigo || !pin.nome?.trim()) return apiError("Informe produto.codigo, ou produto.base_codigo + produto.nome.", 400);
    base = await porCodigo(db, tenant, pin.base_codigo);
    if (!base) return apiError(`Produto base ${pin.base_codigo} não encontrado.`, 404);
    if (!["HD1", "HD2", "AC", "SE"].includes(pref(base))) return apiError(`Produto base ${pin.base_codigo} tem prefixo ${pref(base)} — use HD1/HD2/AC/SE.`, 400);
    const { data: jaTem } = await db.from("products").select("technical_code").eq("tenant_id", tenant).ilike("name", pin.nome.trim()).limit(1);
    if (jaTem?.length) return apiError(`Já existe produto com o nome «${pin.nome.trim()}» (${(jaTem[0] as { technical_code?: string }).technical_code}). Use produto.codigo.`, 409);
  }

  if (pai) {
    if (!canProductHaveBom(pref(pai), pai.composition_enabled, pai.has_composition) && !canToggleComposition(pref(pai))) {
      return apiError(`Produto ${pai.technical_code} (prefixo ${pref(pai)}) não pode ter composição.`, 400);
    }
    const { count } = await db.from("product_components").select("*", { count: "exact", head: true }).eq("tenant_id", tenant).eq("parent_product_id", pai.id);
    if ((count ?? 0) > 0 && !body.substituir) {
      return apiError(`Produto ${pai.technical_code} já tem composição (${count} linhas). Mande substituir: true para trocar.`, 409);
    }
  }

  const resumo = linhas.map((l) => ({ item: l.resumo, qtd: l.quantity, custo_unit: l.unit_cost, subtotal: Math.round(l.quantity * l.unit_cost * 100) / 100 }));
  if (body.simular) {
    return apiOk({ simulado: true, produto: pai ? pai.technical_code : `novo a partir de ${base?.technical_code}: ${pin.nome}`, custo_previsto: Math.round(custoPrevisto * 100) / 100, linhas: resumo });
  }

  if (!pai && base) {
    const { data: novo, error } = await db
      .from("products")
      .insert({
        tenant_id: tenant,
        code: null,
        technical_code: "",
        name: pin.nome!.trim(),
        description: pin.descricao ?? null,
        unit: base.unit ?? "UN",
        ncm: base.ncm,
        type: base.type,
        product_nature: base.product_nature,
        cost_price: 0,
        selling_price: 0,
        is_active: true,
        prefix_id: base.prefix_id,
        family_id: base.family_id,
        subfamily_id: base.subfamily_id,
        material_id: base.material_id,
        finish_id: base.finish_id,
        composition_enabled: true,
        default_is_external_labor: false,
      })
      .select(PROD_COLS)
      .single();
    if (error || !novo) return apiError("Erro ao criar produto: " + (error?.message ?? "?"), 500);
    pai = novo as Prod;
  }
  if (!pai) return apiError("Produto pai indefinido.", 500);

  if (canToggleComposition(pref(pai)) && pai.composition_enabled !== true) {
    await db.from("products").update({ composition_enabled: true }).eq("id", pai.id).eq("tenant_id", tenant);
  }

  if (body.substituir) {
    const { error: delErr } = await db.from("product_components").delete().eq("tenant_id", tenant).eq("parent_product_id", pai.id);
    if (delErr) return apiError("Erro ao limpar composição antiga: " + delErr.message, 500);
  }

  const { error: insErr } = await db.from("product_components").insert(
    linhas.map((l) => ({
      tenant_id: tenant,
      parent_product_id: pai!.id,
      component_product_id: l.component_product_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      is_labor: l.is_labor,
      is_external_labor: l.is_external_labor,
      work_center_id: l.is_external_labor ? null : l.work_center_id,
    }))
  );
  if (insErr) return apiError("Erro ao gravar composição: " + insErr.message, 500);

  const custo = await recalculateProductCost(admin, tenant, pai.id);
  if (isSemiFinishedPrefix(pref(pai))) {
    await db.from("products").update({ cost_price: custo }).eq("id", pai.id).eq("tenant_id", tenant);
  }
  await syncProductHasCompositionFromBom(admin, tenant, pai.id);
  await propagateComponentCostChange(admin, tenant, pai.id);

  const { data: fim } = await db.from("products").select("technical_code, name, cost_price").eq("id", pai.id).maybeSingle();
  const f = fim as { technical_code?: string; name?: string; cost_price?: number } | null;
  return apiOk({
    produto: { codigo: f?.technical_code ?? pai.technical_code, nome: f?.name ?? pai.name, criado: !!base },
    custo_composicao: Math.round(Number(custo ?? custoPrevisto) * 100) / 100,
    linhas: resumo,
    aviso: "Preço de venda não foi mexido — fica com o Helder.",
  });
}

export const GET = comLogDoRobo("compositor", "compositor", getHandler);
export const POST = comLogDoRobo("compositor", "compositor", postHandler);
