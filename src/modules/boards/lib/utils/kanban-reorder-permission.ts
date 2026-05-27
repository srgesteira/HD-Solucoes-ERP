/**
 * Quem não é o utilizador que move mantém a mesma ordem relativa entre si
 * (permite ao membro mover só as tarefas que criou sem baralhar as dos outros).
 */
export function othersRelativeOrderUnchanged<T extends { id: string; created_by: string }>(
  beforeOrderIds: string[],
  afterOrderIds: string[],
  tasksById: Map<string, T>,
  moverUserId: string
): boolean {
  const seq = (order: string[]) =>
    order
      .map((id) => tasksById.get(id))
      .filter((t): t is T => !!t && t.created_by !== moverUserId)
      .map((t) => t.id)
      .join("\0");
  return seq(beforeOrderIds) === seq(afterOrderIds);
}

export function sortOrderBetween(
  left: { sort_order: number } | undefined,
  right: { sort_order: number } | undefined
): number {
  const L = left?.sort_order ?? 0;
  const R = right !== undefined ? right.sort_order : L + 2000;
  if (R - L < 2) {
    return L + 1;
  }
  return Math.floor((L + R) / 2);
}
