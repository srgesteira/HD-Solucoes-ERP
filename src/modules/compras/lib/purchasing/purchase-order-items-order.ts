/** Ordena itens de pedido de compra por `line_number` (depois created_at / id). */
export function sortPurchaseOrderItemsByLineNumber<
  T extends {
    line_number?: number | null;
    created_at?: string | null;
    id?: string | null;
  },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const la = Number(a.line_number);
    const lb = Number(b.line_number);
    const aHas = Number.isFinite(la) && la > 0;
    const bHas = Number.isFinite(lb) && lb > 0;
    if (aHas && bHas && la !== lb) return la - lb;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    const ia = a.id ?? "";
    const ib = b.id ?? "";
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}
