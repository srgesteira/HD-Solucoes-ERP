export type ProductionLineBrief = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
  hvac_cleanroom_class?: string | null;
};

export async function fetchProductionLines(): Promise<ProductionLineBrief[]> {
  const res = await fetch("/api/production/lines", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionLineBrief[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar linhas");
  return json.data ?? [];
}

export async function fetchProductionLine(
  id: string
): Promise<ProductionLineBrief> {
  const res = await fetch(`/api/production/lines/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionLineBrief;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar linha");
  if (!json.data) throw new Error("Linha não encontrada");
  return json.data;
}
