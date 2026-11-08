import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import seed202611 from "@/modules/crm/data/prospeccao-2026-11.json";
import seedRotina202611 from "@/modules/crm/data/prospeccao-rotina-2026-11.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Lead = {
  nome: string;
  segmento?: string;
  cidade?: string;
  uf?: string;
  contato?: string;
  email?: string;
  tel?: string;
  site?: string;
  gancho?: string;
  hist?: string;
  prox?: string;
  etapa?: string;
  origem?: string;
  quando?: string;
};

const SEEDS: Record<string, Lead[]> = {
  "2026-11": seed202611 as Lead[],
  "rotina-2026-11": seedRotina202611 as Lead[],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const GENERIC = new Set(["grupo", "engenharia", "comercio", "industria", "servicos", "climatizacao", "refrigeracao", "org", "cia", "ltda", "the"]);
const firstWord = (s: string) =>
  norm(s.split(/[\s/(,.-]+/).map((w) => w.trim()).find((w) => w.length > 2 && !GENERIC.has(norm(w))) ?? s);
const domain = (email?: string) => {
  const d = email?.split("@")[1]?.toLowerCase();
  return d && !/gmail|hotmail|outlook|yahoo|uol|bol/.test(d) ? d : null;
};

/**
 * POST /api/crm/import  { leads: Lead[] }  ou  { seed: "2026-11" }
 * Cria leads no CRM sem duplicar (compara 1ª palavra do nome e domínio do e-mail).
 * Existente: só completa campos vazios. Novo: cliente (etapa lead/contato) + contato + nota com histórico.
 */
export async function POST(request: NextRequest) {
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const body = (await request.json().catch(() => ({}))) as { leads?: Lead[]; seed?: string };
  const leads = body.seed ? SEEDS[body.seed] : body.leads;
  if (!Array.isArray(leads) || !leads.length) return apiError("Nenhum lead", 400);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const [{ data: existing }, { data: reps }] = await Promise.all([
    admin.from("customers").select("id, name, trade_name, email, phone, website, segment, address_city, address_state").eq("tenant_id", tenantId),
    admin.from("sales_reps").select("id, name").eq("tenant_id", tenantId).eq("name", "Helder"),
  ]);
  const helder = (reps as { id: string }[] | null)?.[0]?.id ?? null;
  type Ex = Record<string, string | null> & { id: string; name: string };
  const ex = (existing ?? []) as Ex[];
  const byWord = new Map<string, Ex>();
  const byDomain = new Map<string, Ex>();
  for (const c of ex) {
    for (const n of [c.name, c.trade_name]) if (n) byWord.set(firstWord(n), c);
    const d = domain(c.email ?? undefined);
    if (d) byDomain.set(d, c);
  }

  let criados = 0;
  let atualizados = 0;
  const erros: string[] = [];
  for (const l of leads.slice(0, 300)) {
    if (!l.nome) continue;
    const match = byWord.get(firstWord(l.nome)) ?? (domain(l.email) ? byDomain.get(domain(l.email)!) : undefined);
    try {
      if (match) {
        const patch: Record<string, unknown> = {};
        if (!match.email && l.email) patch.email = l.email;
        if (!match.phone && l.tel) patch.phone = l.tel;
        if (!match.website && l.site) patch.website = l.site;
        if (!match.segment && l.segmento) patch.segment = l.segmento;
        if (!match.address_city && l.cidade) patch.address_city = l.cidade;
        if (!match.address_state && l.uf) patch.address_state = l.uf;
        if (Object.keys(patch).length) {
          await admin.from("customers").update(patch).eq("id", match.id);
          atualizados++;
        }
        continue;
      }
      const { data: c, error } = await admin
        .from("customers")
        .insert({
          tenant_id: tenantId,
          name: l.nome,
          email: l.email ?? null,
          phone: l.tel ?? null,
          website: l.site ?? null,
          segment: l.segmento ?? null,
          address_city: l.cidade ?? null,
          address_state: l.uf ?? null,
          crm_stage: l.etapa === "contato" ? "contato" : "lead",
          lead_source: l.origem ?? "importacao",
          next_contact_at: l.quando ?? null,
          next_action: l.prox ?? null,
          sales_rep_id: helder,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = (c as { id: string }).id;
      if (l.contato) {
        await admin.from("crm_contacts").insert({
          tenant_id: tenantId,
          customer_id: id,
          name: l.contato,
          email: l.email ?? null,
          phone: l.tel ?? null,
          is_primary: true,
        });
      }
      const nota = [l.gancho && `Gancho: ${l.gancho}`, l.hist && `Histórico: ${l.hist}`].filter(Boolean).join(" · ");
      if (nota) {
        await admin.from("crm_activities").insert({
          tenant_id: tenantId,
          customer_id: id,
          type: "nota",
          summary: nota,
          done: true,
          created_by: "claude",
        });
      }
      byWord.set(firstWord(l.nome), { id, name: l.nome } as Ex);
      criados++;
    } catch (e) {
      erros.push(`${l.nome}: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`);
    }
  }
  return apiOk({ recebidos: leads.length, criados, atualizados, erros });
}
