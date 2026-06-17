/** Formata valor monetário BRL — helper único do ERP. */
export function formatBrl(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export const fmtBRL = formatBrl;
