import type { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import type { BlingNfeVolume } from "@/modules/fiscal/lib/bling/bling-nfe-payload";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function parseKg(text: string, label: RegExp): number | undefined {
  const m = text.match(label);
  if (!m) return undefined;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : undefined;
}

/**
 * Volumes e peso da NF-e a partir da expedição do pedido (shipments).
 * Peso vem de `packaging_description` ou `notes`, no formato:
 *   "Peso bruto: 38,4 kg · Peso líquido: 36,4 kg"
 * Sem expedição/volumes → null (a nota sai sem o grupo <vol>, como antes).
 */
export async function loadNfeVolumeForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<BlingNfeVolume | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("shipments")
    .select("volumes_count, packaging_description, notes, created_at")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const qtd = Math.floor(Number(data?.volumes_count ?? 0));
  if (!data || !(qtd > 0)) return null;
  const text = `${data.packaging_description ?? ""} ${data.notes ?? ""}`;
  const pesoBruto = parseKg(text, /bruto[^0-9]{0,12}([\d.,]+)\s*kg/i);
  const pesoLiquido = parseKg(text, /l[ií]quido[^0-9]{0,12}([\d.,]+)\s*kg/i);
  return {
    quantidade: qtd,
    especie: 2,
    ...(pesoBruto ? { pesoBruto } : {}),
    ...(pesoLiquido ? { pesoLiquido } : pesoBruto ? { pesoLiquido: pesoBruto } : {}),
  };
}
