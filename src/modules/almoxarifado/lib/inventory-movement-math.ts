/** Efeito assinado de um movimento no saldo (in +, out −, adjustment como gravado). */
export function signedMovementQuantity(
  movementType: string,
  quantity: number
): number {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return 0;
  if (movementType === "in") return Math.abs(q);
  if (movementType === "out") return -Math.abs(q);
  return q;
}

/** Soma dos movimentos = saldo esperado quando o extrato é a fonte da verdade. */
export function sumMovementBalances(
  movements: { movement_type: string; quantity: number }[]
): number {
  let total = 0;
  for (const m of movements) {
    total += signedMovementQuantity(m.movement_type, m.quantity);
  }
  return Math.round((total + Number.EPSILON) * 10000) / 10000;
}
