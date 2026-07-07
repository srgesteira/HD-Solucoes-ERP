/** Prefixos removidos ao encurtar descrições de movimento. */
const MOVEMENT_PREFIX = /^(Pagamento|Recebimento):\s*/i;

/**
 * Formata descrição curta para listagens financeiras.
 * Ex.: "Parcela 1/1 — PC 8/2026" → "PC. 8/2026 / Parcela 1"
 */
export function formatShortFinanceDescription(description: string): string {
  let text = description.trim().replace(MOVEMENT_PREFIX, "");
  if (!text) return "—";

  const parcelDoc = text.match(
    /^Parcela\s+(\d+)(?:\/\d+)?\s*[—–-]\s*(?:PC|pedido)\s+(.+)$/i
  );
  if (parcelDoc) {
    const docLabel = text.match(/PC\s+/i)
      ? `PC. ${parcelDoc[2].trim()}`
      : `PV. ${parcelDoc[2].trim()}`;
    return `${docLabel} / Parcela ${parcelDoc[1]}`;
  }

  const forecastPv = text.match(
    /^Previs[aã]o\s+parcela\s+(\d+)(?:\/\d+)?\s*[—–-]\s*PV\s+(.+)$/i
  );
  if (forecastPv) {
    return `PV. ${forecastPv[2].trim()} / Parcela ${forecastPv[1]}`;
  }

  const pcOnly = text.match(/^PC\s+(.+)$/i);
  if (pcOnly) return `PC. ${pcOnly[1].trim()}`;

  const pvOnly = text.match(/^PV\s+(.+)$/i);
  if (pvOnly) return `PV. ${pvOnly[1].trim()}`;

  return text;
}

export function financeDirectionLabel(direction: "in" | "out"): string {
  return direction === "in" ? "Entrada" : "Saída";
}
