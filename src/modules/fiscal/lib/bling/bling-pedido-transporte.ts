export const NFE_FREIGHT_ACCOUNT_OPTIONS = [
  {
    value: "CIF",
    label: "CIF — por conta do remetente (emitente)",
  },
  {
    value: "FOB",
    label: "FOB — por conta do destinatário (cliente)",
  },
  {
    value: "Outro",
    label: "Sem ocorrência de transporte / terceiros",
  },
] as const;

export function freightPayerFromShippingType(
  shippingType: string | null | undefined
): "remetente" | "destinatario" | "terceiros" {
  const s = String(shippingType ?? "").trim().toUpperCase();
  if (s === "CIF") return "remetente";
  if (s === "FOB") return "destinatario";
  return "terceiros";
}

export function buildBlingTransportePayload(input: {
  shippingType?: string | null;
  freightCost?: number | null;
  carrierName?: string | null;
}): {
  fretePorConta: 0 | 1 | 9;
  frete?: number;
  contato?: { nome: string };
} {
  const freight = Number(input.freightCost ?? 0);
  const nome = String(input.carrierName ?? "").trim();
  return {
    fretePorConta: fretePorContaFromShipping(input.shippingType),
    ...(Number.isFinite(freight) && freight > 0
      ? { frete: Math.round((freight + Number.EPSILON) * 100) / 100 }
      : {}),
    ...(nome ? { contato: { nome } } : {}),
  };
}

export function fretePorContaLabel(code: 0 | 1 | 9): string {
  if (code === 0) return "0 — Remetente (CIF)";
  if (code === 1) return "1 — Destinatário (FOB)";
  return "9 — Sem ocorrência de transporte";
}

/** CIF = remetente (0), FOB = destinatário (1), sem transporte = 9. */
export function fretePorContaFromShipping(
  shippingType: string | null | undefined
): 0 | 1 | 9 {
  const s = String(shippingType ?? "").trim().toUpperCase();
  if (s === "CIF") return 0;
  if (s === "FOB") return 1;
  return 9;
}

export function shippingFromFretePorConta(
  value: unknown
): "CIF" | "FOB" | null {
  const n = Number(value);
  if (n === 0) return "CIF";
  if (n === 1) return "FOB";
  return null;
}

export function freightPayerFromFretePorConta(
  value: unknown
): "remetente" | "destinatario" | "terceiros" | null {
  const n = Number(value);
  if (n === 0) return "remetente";
  if (n === 1) return "destinatario";
  if (n === 2) return "terceiros";
  return null;
}

export function parseBlingPedidoTransporte(payload: unknown): {
  shipping_type: "CIF" | "FOB" | null;
  freight_cost: number;
  carrier_name: string | null;
  freight_payer: string | null;
} {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const transporte =
    data.transporte && typeof data.transporte === "object"
      ? (data.transporte as Record<string, unknown>)
      : null;
  if (!transporte) {
    return {
      shipping_type: null,
      freight_cost: 0,
      carrier_name: null,
      freight_payer: null,
    };
  }
  const contato =
    transporte.contato && typeof transporte.contato === "object"
      ? (transporte.contato as Record<string, unknown>)
      : null;
  const nome = String(contato?.nome ?? "").trim();
  const frete = Number(transporte.frete);
  return {
    shipping_type: shippingFromFretePorConta(transporte.fretePorConta),
    freight_cost: Number.isFinite(frete) && frete > 0 ? frete : 0,
    carrier_name: nome || null,
    freight_payer: freightPayerFromFretePorConta(transporte.fretePorConta),
  };
}

export function readBlingPedidoNotaFiscalId(payload: unknown): number | null {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const nf = data.notaFiscal;
  if (!nf || typeof nf !== "object") return null;
  const id = Number((nf as { id?: unknown }).id);
  return Number.isFinite(id) ? id : null;
}
