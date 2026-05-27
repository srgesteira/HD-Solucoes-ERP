/** Naturezas atendidas por compra quando não há BOM. */
const PURCHASE_NATURES = new Set(["MP", "EB", "MC", "RV"]);

export type PcpItemOriginKind = "produzir" | "estoque" | "comprar";

export type PcpItemOrigin = {
  kind: PcpItemOriginKind;
  /** Rótulo na UI: Produzir | Comprar | Estoque */
  label: string;
  /** Alias explícito pedido na API (`origin`). */
  origin: string;
};

export type PcpItemOriginInput = {
  product_nature: string | null;
  /** Existe linha em `product_components` com `parent_product_id` = produto. */
  has_bom: boolean;
  /** Fallback legado (`products.has_composition`) quando BOM ainda não sincronizada. */
  has_composition?: boolean;
  /** Acabado sem natureza explícita → produzir. */
  product_type?: string | null;
};

/**
 * Origem do item no PCP (informativa):
 * - Produzir: tem BOM ou acabado (AC) / tipo finished.
 * - Comprar: sem BOM e natureza MP, EB, MC, RV ou SE sem BOM.
 * Estoque (saldo) fica para evolução futura.
 */
export function resolvePcpItemOrigin(input: PcpItemOriginInput): PcpItemOrigin {
  const nature = (input.product_nature ?? "").trim().toUpperCase();
  const hasBom =
    input.has_bom === true || input.has_composition === true;

  if (hasBom) {
    return produzir();
  }

  if (nature === "SE" || PURCHASE_NATURES.has(nature)) {
    return comprar();
  }

  if (nature === "AC" || input.product_type === "finished") {
    return produzir();
  }

  if (nature === "") {
    return input.product_type === "raw" || input.product_type === "component"
      ? comprar()
      : produzir();
  }

  return comprar();
}

function produzir(): PcpItemOrigin {
  return { kind: "produzir", label: "Produzir", origin: "Produzir" };
}

function comprar(): PcpItemOrigin {
  return { kind: "comprar", label: "Comprar", origin: "Comprar" };
}

export function pcpItemOriginClass(kind: PcpItemOriginKind): string {
  switch (kind) {
    case "produzir":
      return "text-blue-800";
    case "estoque":
      return "text-emerald-800";
    case "comprar":
      return "text-amber-900";
    default:
      return "text-slate-600";
  }
}
