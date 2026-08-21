import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { blingGet, blingPatch, blingPost, blingPut } from "@/modules/fiscal/lib/bling/bling-client";
import { unwrapBlingData } from "@/modules/fiscal/lib/bling/bling-nfe-status";
import {
  blingEnderecoFromParts,
  parseFreeformAddressToBling,
  type BlingEnderecoPayload,
} from "@/modules/fiscal/lib/bling/bling-contact-address";
import { lookupCnpj } from "@/shared/utils/external/document-lookup";

type Admin = SupabaseClient<Database>;

export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function firstBlingId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data) && data.length > 0) {
    const id = Number((data[0] as { id?: unknown }).id);
    return Number.isFinite(id) ? id : null;
  }
  if (data && typeof data === "object") {
    const id = Number((data as { id?: unknown }).id);
    return Number.isFinite(id) ? id : null;
  }
  return null;
}

async function resolveBlingEndereco(input: {
  address: string | null;
  document: string | null;
}): Promise<BlingEnderecoPayload | null> {
  const parsed = parseFreeformAddressToBling(input.address);
  if (parsed) return parsed;
  const doc = digitsOnly(input.document);
  if (doc.length !== 14) return null;
  try {
    const lookup = await lookupCnpj(doc);
    return blingEnderecoFromParts(lookup.address_parts);
  } catch {
    return null;
  }
}

function contactPayload(input: {
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  endereco: BlingEnderecoPayload | null;
}): Record<string, unknown> {
  const doc = digitsOnly(input.document);
  const tipo = doc.length === 14 ? "J" : "F";
  return {
    nome: input.name.trim() || "Cliente",
    tipo,
    situacao: "A",
    numeroDocumento: doc || undefined,
    email: input.email?.trim() || undefined,
    telefone: input.phone?.trim() || undefined,
    ...(input.endereco ? { endereco: input.endereco } : {}),
  };
}

export async function findBlingProductIdByCodigo(
  admin: Admin,
  tenantId: string,
  codigo: string
): Promise<number | null> {
  const code = codigo.trim();
  if (!code) return null;
  const qs = new URLSearchParams({
    codigo: code,
    limite: "5",
    pagina: "1",
  });
  const payload = await blingGet(admin, tenantId, `/produtos?${qs.toString()}`);
  return firstBlingId(payload);
}

export async function findBlingContactIdByDocument(
  admin: Admin,
  tenantId: string,
  document: string
): Promise<number | null> {
  const numeroDocumento = digitsOnly(document);
  if (numeroDocumento.length < 11) return null;
  const qs = new URLSearchParams({
    numeroDocumento,
    limite: "5",
    pagina: "1",
  });
  const payload = await blingGet(admin, tenantId, `/contatos?${qs.toString()}`);
  return firstBlingId(payload);
}

export async function createBlingContact(
  admin: Admin,
  tenantId: string,
  input: {
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  }
): Promise<number> {
  const endereco = await requireBlingEndereco(input);
  const payload = await blingPost(
    admin,
    tenantId,
    "/contatos",
    contactPayload({ ...input, endereco })
  );
  const data = unwrapBlingData(payload);
  const id = Number(data?.id);
  if (!Number.isFinite(id)) {
    throw new Error("Bling criou o contato mas não devolveu o ID.");
  }
  await assertBlingContactHasAddress(admin, tenantId, id);
  return id;
}

async function requireBlingEndereco(input: {
  address: string | null;
  document: string | null;
}): Promise<BlingEnderecoPayload> {
  const endereco = await resolveBlingEndereco(input);
  if (endereco) return endereco;
  throw new Error(
    "Cliente sem endereço completo (logradouro, cidade, UF e CEP). Preencha o endereço no pedido — o Bling precisa disso para a NF-e."
  );
}

function readBlingContactEndereco(
  payload: unknown
): { cep: string; municipio: string; uf: string; endereco: string } | null {
  const data = unwrapBlingData(payload);
  if (!data) return null;
  const raw =
    data.endereco && typeof data.endereco === "object"
      ? (data.endereco as Record<string, unknown>)
      : null;
  if (!raw) return null;
  return {
    cep: String(raw.cep ?? "").replace(/\D/g, ""),
    municipio: String(raw.municipio ?? "").trim(),
    uf: String(raw.uf ?? "").trim(),
    endereco: String(raw.endereco ?? "").trim(),
  };
}

async function assertBlingContactHasAddress(
  admin: Admin,
  tenantId: string,
  contactId: number
): Promise<void> {
  const payload = await blingGet(admin, tenantId, `/contatos/${contactId}`);
  const end = readBlingContactEndereco(payload);
  if (!end || end.cep.length !== 8 || !end.municipio || !end.endereco) {
    throw new Error(
      "O Bling gravou o cliente sem endereço completo. Abra o contacto no Bling e confira CEP, município e logradouro."
    );
  }
}

async function upsertBlingContactAddress(
  admin: Admin,
  tenantId: string,
  contactId: number,
  input: {
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  }
): Promise<void> {
  const endereco = await requireBlingEndereco(input);
  const body = contactPayload({ ...input, endereco });
  try {
    await blingPut(admin, tenantId, `/contatos/${contactId}`, body);
  } catch {
    await blingPatch(admin, tenantId, `/contatos/${contactId}`, body);
  }
  await assertBlingContactHasAddress(admin, tenantId, contactId);
}

export type UnmappedBlingProduct = {
  product_id: string;
  code: string | null;
  technical_code: string | null;
  name: string;
};

export type BlingCatalogReadiness = {
  contactId: number | null;
  contactCreated: boolean;
  unmappedProducts: UnmappedBlingProduct[];
  mappedProductIds: Map<string, number>;
};

/**
 * Neste botão: cria/actualiza cliente (CNPJ + endereço), produtos e o pedido.
 */
export async function resolveBlingCatalogForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<BlingCatalogReadiness> {
  const db = asUntypedAdmin(admin);
  const { data: soRaw, error: soErr } = await db
    .from("sales_orders")
    .select("id, client_name, client_document, client_email, client_phone, client_address")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  if (!soRaw) throw new Error("Pedido não encontrado.");
  const so = soRaw as {
    client_name: string;
    client_document: string | null;
    client_email: string | null;
    client_phone: string | null;
    client_address: string | null;
  };

  const doc = digitsOnly(so.client_document);
  let contactId: number | null = null;
  let contactCreated = false;

  if (doc.length >= 11) {
    const { data: customer } = await db
      .from("customers")
      .select("id, bling_contact_id, document")
      .eq("tenant_id", tenantId)
      .eq("document", so.client_document ?? doc)
      .maybeSingle();
    const cust = customer as {
      id: string;
      bling_contact_id: number | null;
    } | null;
    if (cust?.bling_contact_id) {
      contactId = Number(cust.bling_contact_id);
    } else {
      const { data: byDigits } = await db
        .from("customers")
        .select("id, bling_contact_id, document")
        .eq("tenant_id", tenantId)
        .not("document", "is", null);
      const match = ((byDigits ?? []) as Array<{
        id: string;
        bling_contact_id: number | null;
        document: string | null;
      }>).find((c) => digitsOnly(c.document) === doc);
      if (match?.bling_contact_id) contactId = Number(match.bling_contact_id);
    }
  }

  if (!contactId && doc.length >= 11) {
    contactId = await findBlingContactIdByDocument(admin, tenantId, doc);
  }

  if (!contactId) {
    contactId = await createBlingContact(admin, tenantId, {
      name: so.client_name,
      document: so.client_document,
      email: so.client_email,
      phone: so.client_phone,
      address: so.client_address,
    });
    contactCreated = true;
  } else {
    await upsertBlingContactAddress(admin, tenantId, contactId, {
      name: so.client_name,
      document: so.client_document,
      email: so.client_email,
      phone: so.client_phone,
      address: so.client_address,
    });
  }

  if (contactId && doc.length >= 11) {
    const { data: customers } = await db
      .from("customers")
      .select("id, document")
      .eq("tenant_id", tenantId)
      .not("document", "is", null);
    const ids = (
      (customers ?? []) as Array<{ id: string; document: string | null }>
    )
      .filter((c) => digitsOnly(c.document) === doc)
      .map((c) => c.id);
    if (ids.length) {
      await db
        .from("customers")
        .update({ bling_contact_id: contactId })
        .eq("tenant_id", tenantId)
        .in("id", ids);
    }
  }

  const { data: itemRows, error: itemsErr } = await db
    .from("sales_order_items")
    .select(
      "id, product_id, description, product:products!sales_order_items_product_id_fkey(id, code, technical_code, name, bling_product_id)"
    )
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (itemsErr) throw new Error(itemsErr.message);

  const mappedProductIds = new Map<string, number>();
  const unmappedProducts: UnmappedBlingProduct[] = [];
  const seen = new Set<string>();

  for (const raw of itemRows ?? []) {
    const it = raw as {
      product_id: string | null;
      description: string;
      product?:
        | {
            id: string;
            code: string | null;
            technical_code: string | null;
            name: string;
            bling_product_id: number | null;
          }
        | {
            id: string;
            code: string | null;
            technical_code: string | null;
            name: string;
            bling_product_id: number | null;
          }[]
        | null;
    };
    const product = Array.isArray(it.product) ? it.product[0] : it.product;
    if (!product?.id) {
      unmappedProducts.push({
        product_id: it.product_id ?? "",
        code: null,
        technical_code: null,
        name: it.description,
      });
      continue;
    }
    if (seen.has(product.id)) {
      if (product.bling_product_id) {
        mappedProductIds.set(product.id, Number(product.bling_product_id));
      }
      continue;
    }
    seen.add(product.id);

    let blingId = product.bling_product_id
      ? Number(product.bling_product_id)
      : null;
    if (!blingId) {
      const codigo = (product.code ?? product.technical_code ?? "").trim();
      if (codigo) {
        blingId = await findBlingProductIdByCodigo(admin, tenantId, codigo);
        if (blingId) {
          await db
            .from("products")
            .update({ bling_product_id: blingId })
            .eq("id", product.id)
            .eq("tenant_id", tenantId);
        }
      }
    }
    if (blingId) {
      mappedProductIds.set(product.id, blingId);
    } else {
      unmappedProducts.push({
        product_id: product.id,
        code: product.code,
        technical_code: product.technical_code,
        name: product.name,
      });
    }
  }

  return {
    contactId,
    contactCreated,
    unmappedProducts,
    mappedProductIds,
  };
}

export async function syncBlingProductLinks(
  admin: Admin,
  tenantId: string
): Promise<{ linked: number; missing: number; scanned: number }> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("products")
    .select("id, code, technical_code, name, bling_product_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  let linked = 0;
  let missing = 0;
  const rows = (data ?? []) as Array<{
    id: string;
    code: string | null;
    technical_code: string | null;
    bling_product_id: number | null;
  }>;

  for (const p of rows) {
    if (p.bling_product_id) {
      linked += 1;
      continue;
    }
    const codigo = (p.code ?? p.technical_code ?? "").trim();
    if (!codigo) {
      missing += 1;
      continue;
    }
    const id = await findBlingProductIdByCodigo(admin, tenantId, codigo);
    if (id) {
      await db
        .from("products")
        .update({ bling_product_id: id })
        .eq("id", p.id)
        .eq("tenant_id", tenantId);
      linked += 1;
    } else {
      missing += 1;
    }
  }

  return { linked, missing, scanned: rows.length };
}

export type CreateBlingProductResult = {
  bling_product_id: number;
  created: boolean;
  codigo: string;
};

/**
 * Cria o cadastro no Bling (SKU, nome, unidade e NCM da conferência).
 * CFOP/CSOSN continuam na natureza de operação / grupo fiscal do Bling.
 */
export async function createBlingProduct(
  admin: Admin,
  tenantId: string,
  input: {
    nome: string;
    codigo: string;
    unidade: string | null;
    ncm?: string | null;
  }
): Promise<number> {
  const nome = input.nome.trim();
  const codigo = input.codigo.trim();
  if (!nome) throw new Error("Nome do produto é obrigatório para criar no Bling.");
  if (!codigo) throw new Error("Código/SKU é obrigatório para criar no Bling.");

  const ncm = String(input.ncm ?? "").replace(/\D/g, "");
  const payload = await blingPost(admin, tenantId, "/produtos", {
    nome,
    codigo,
    tipo: "P",
    situacao: "A",
    formato: "S",
    unidade: input.unidade?.trim() || "UN",
    ...(ncm.length >= 8 ? { tributacao: { ncm: ncm.slice(0, 8) } } : {}),
  });
  const id = Number(unwrapBlingData(payload)?.id);
  if (!Number.isFinite(id)) {
    throw new Error("Bling criou o produto mas não devolveu o ID.");
  }
  return id;
}

export async function patchBlingProductNcm(
  admin: Admin,
  tenantId: string,
  blingProductId: number,
  ncm: string | null | undefined
): Promise<void> {
  const digits = String(ncm ?? "").replace(/\D/g, "");
  if (digits.length < 8 || !Number.isFinite(blingProductId)) return;
  await blingPatch(admin, tenantId, `/produtos/${blingProductId}`, {
    tributacao: { ncm: digits.slice(0, 8) },
  });
}

export async function createAndLinkBlingProduct(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<CreateBlingProductResult> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("products")
    .select("id, code, technical_code, name, unit, ncm, bling_product_id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Produto não encontrado.");

  const product = data as {
    id: string;
    code: string | null;
    technical_code: string | null;
    name: string;
    unit: string | null;
    ncm: string | null;
    bling_product_id: number | null;
  };

  if (product.bling_product_id) {
    const existingId = Number(product.bling_product_id);
    await patchBlingProductNcm(admin, tenantId, existingId, product.ncm);
    return {
      bling_product_id: existingId,
      created: false,
      codigo: (product.code ?? product.technical_code ?? "").trim(),
    };
  }

  const codigo = (product.code ?? product.technical_code ?? "").trim();
  if (!codigo) {
    throw new Error(
      "Produto sem código/SKU. Preencha o código no cadastro antes de criar no Bling."
    );
  }

  let blingId = await findBlingProductIdByCodigo(admin, tenantId, codigo);
  let created = false;
  if (!blingId) {
    try {
      blingId = await createBlingProduct(admin, tenantId, {
        nome: product.name,
        codigo,
        unidade: product.unit,
        ncm: product.ncm,
      });
      created = true;
    } catch (e) {
      const existing = await findBlingProductIdByCodigo(admin, tenantId, codigo);
      if (existing) {
        blingId = existing;
      } else {
        throw e;
      }
    }
  }

  await db
    .from("products")
    .update({ bling_product_id: blingId })
    .eq("id", product.id)
    .eq("tenant_id", tenantId);

  if (!created) {
    await patchBlingProductNcm(admin, tenantId, blingId, product.ncm);
  }

  return { bling_product_id: blingId, created, codigo };
}

export async function createAndLinkBlingProductForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  productId: string
): Promise<CreateBlingProductResult> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Este produto não pertence ao pedido.");
  }
  return createAndLinkBlingProduct(admin, tenantId, productId);
}
