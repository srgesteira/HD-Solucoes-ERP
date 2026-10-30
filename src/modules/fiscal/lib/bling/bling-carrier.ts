import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  createBlingContact,
  digitsOnly,
  findBlingContactIdByDocument,
} from "@/modules/fiscal/lib/bling/bling-catalog";

type Admin = SupabaseClient<Database>;

/** Grupo `transporte.transportador` do POST/PUT /nfe (API Bling v3). */
export type BlingNfeTransportador = {
  nome: string;
  numeroDocumento?: string;
  endereco?: {
    endereco?: string;
    municipio?: string;
    uf?: string;
  };
};

export type ResolvedBlingCarrier = {
  transportador: BlingNfeTransportador;
  /** Contato da transportadora no Bling (criado se ainda não existir). */
  blingContactId: number | null;
  /** Fornecedor do ERP usado como cadastro da transportadora. */
  supplierId: string | null;
  /** Aviso não bloqueante (ex.: falha ao criar o contato no Bling). */
  warning: string | null;
};

type SupplierRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
};

const SUPPLIER_COLUMNS =
  "id, name, legal_name, document, email, phone, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip";

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Procura a transportadora no cadastro de fornecedores do ERP.
 * Aceita no campo "transportadora" do pedido: o nome (fantasia ou razão social)
 * ou o CNPJ — sozinho ou junto do nome (ex.: "MODULAR - 88.009.030/0001-00").
 */
export async function findCarrierSupplier(
  admin: Admin,
  tenantId: string,
  carrierName: string
): Promise<SupplierRow | null> {
  const db = asUntypedAdmin(admin);
  const docInName = (carrierName.match(/\d[\d./-]{12,}\d/) ?? [""])[0];
  const doc = digitsOnly(docInName);

  const { data } = await db
    .from("suppliers")
    .select(SUPPLIER_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const rows = (data ?? []) as SupplierRow[];

  if (doc.length === 14) {
    const byDoc = rows.find((r) => digitsOnly(r.document) === doc);
    if (byDoc) return byDoc;
  }

  const wanted = normalizeName(carrierName.replace(docInName, "").replace(/[-–—]\s*$/, ""));
  if (!wanted) return null;
  return (
    rows.find(
      (r) =>
        normalizeName(r.name) === wanted || normalizeName(r.legal_name) === wanted
    ) ?? null
  );
}

function supplierAddressLine(s: SupplierRow): string | null {
  const parts = [
    s.address_street?.trim(),
    s.address_number?.trim() ? `nº ${s.address_number.trim()}` : null,
    s.address_complement?.trim(),
    s.address_neighborhood?.trim(),
    s.address_city?.trim(),
    s.address_state?.trim(),
    s.address_zip?.trim(),
  ].filter((p): p is string => Boolean(p));
  return parts.length >= 4 ? parts.join(", ") : null;
}

/**
 * Resolve a transportadora do pedido para a NF-e:
 * - se estiver cadastrada como fornecedor no ERP, usa CNPJ e endereço de lá
 *   e garante o contato dela no Bling (procura pelo CNPJ; cria se não existir);
 * - se não estiver cadastrada, manda pelo menos o nome no grupo do transportador.
 * Falhas no Bling não bloqueiam a emissão — viram aviso.
 */
export async function resolveBlingCarrier(
  admin: Admin,
  tenantId: string,
  carrierName: string | null | undefined
): Promise<ResolvedBlingCarrier | null> {
  const raw = String(carrierName ?? "").trim();
  if (!raw) return null;

  const supplier = await findCarrierSupplier(admin, tenantId, raw);
  if (!supplier) {
    return {
      transportador: { nome: raw.slice(0, 60) },
      blingContactId: null,
      supplierId: null,
      warning:
        "Transportadora não encontrada em Fornecedores — a NF-e sai só com o nome. Cadastre-a com CNPJ e endereço para sair completa.",
    };
  }

  const nome = (supplier.legal_name?.trim() || supplier.name.trim()).slice(0, 60);
  const doc = digitsOnly(supplier.document);
  const enderecoLinha = [
    supplier.address_street?.trim(),
    supplier.address_number?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  const transportador: BlingNfeTransportador = {
    nome,
    ...(doc.length === 14 || doc.length === 11 ? { numeroDocumento: doc } : {}),
    ...(enderecoLinha || supplier.address_city || supplier.address_state
      ? {
          endereco: {
            ...(enderecoLinha ? { endereco: enderecoLinha.slice(0, 60) } : {}),
            ...(supplier.address_city?.trim()
              ? { municipio: supplier.address_city.trim() }
              : {}),
            ...(supplier.address_state?.trim()
              ? { uf: supplier.address_state.trim().toUpperCase().slice(0, 2) }
              : {}),
          },
        }
      : {}),
  };

  let blingContactId: number | null = null;
  let warning: string | null = null;
  if (doc.length >= 11) {
    try {
      blingContactId = await findBlingContactIdByDocument(admin, tenantId, doc);
      if (!blingContactId) {
        blingContactId = await createBlingContact(admin, tenantId, {
          name: nome,
          document: doc,
          email: supplier.email,
          phone: supplier.phone,
          address: supplierAddressLine(supplier),
        });
      }
    } catch (e) {
      warning = `Não foi possível cadastrar a transportadora no Bling: ${
        e instanceof Error ? e.message : String(e)
      }`;
    }
  }

  return { transportador, blingContactId, supplierId: supplier.id, warning };
}

/**
 * Troca o `transporte.contato` (que o POST /nfe ignora) pelo grupo
 * `transporte.transportador`, que é o que vira `<transporta>` no XML.
 */
export function applyBlingCarrierToNfeBody(
  body: Record<string, unknown>,
  carrier: ResolvedBlingCarrier | null
): Record<string, unknown> {
  const transporte =
    body.transporte && typeof body.transporte === "object"
      ? { ...(body.transporte as Record<string, unknown>) }
      : null;
  if (!transporte) return body;
  delete transporte.contato;
  if (carrier) transporte.transportador = carrier.transportador;
  return { ...body, transporte };
}
