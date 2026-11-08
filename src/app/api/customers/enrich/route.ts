import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { buildEnrichPatch, fetchCnpj, type CustomerRow } from "@/modules/crm/lib/cnpj-enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { ids?: string[] } — completa pelo CNPJ os clientes com cadastro fiscal incompleto
 * (ou só os ids informados). Só preenche campos vazios. Resposta curta.
 */
export async function POST(request: NextRequest) {
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
  const admin = asUntypedAdmin(createSupabaseAdminClient());

  let q = admin.from("customers").select("*").eq("tenant_id", tenantId);
  if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.slice(0, 50));
  else q = q.or("address_state.is.null,address_city.is.null,address_zip.is.null,tax_regime.is.null").limit(40);
  const { data, error } = await q;
  if (error) return apiError(error.message, 500);

  const out: { cliente: string; ok: boolean; campos?: string[]; erro?: string }[] = [];
  for (const c of (data ?? []) as CustomerRow[]) {
    const digits = String(c.document ?? "").replace(/\D/g, "");
    const name = String(c.name ?? "");
    if (digits.length !== 14) {
      out.push({ cliente: name, ok: false, erro: digits.length === 11 ? "CPF (preencher à mão)" : "sem CNPJ" });
      continue;
    }
    try {
      const r = await fetchCnpj(digits);
      if (!r) {
        out.push({ cliente: name, ok: false, erro: "CNPJ não encontrado" });
        continue;
      }
      const patch = buildEnrichPatch(c, r);
      if (Object.keys(patch).length) {
        const { error: upErr } = await admin.from("customers").update(patch).eq("id", c.id).eq("tenant_id", tenantId);
        if (upErr) {
          out.push({ cliente: name, ok: false, erro: upErr.message });
          continue;
        }
      }
      out.push({ cliente: name, ok: true, campos: Object.keys(patch) });
    } catch (e) {
      out.push({ cliente: name, ok: false, erro: e instanceof Error ? e.message : "erro" });
    }
    await new Promise((res) => setTimeout(res, 350)); // gentil com a BrasilAPI
  }
  return apiOk({ total: out.length, ok: out.filter((o) => o.ok).length, resultado: out });
}
