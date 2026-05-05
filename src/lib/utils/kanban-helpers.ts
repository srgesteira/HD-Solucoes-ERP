import type { Task } from "@/lib/types/kanban";

export const SORT_ORDER_GAP = 1000;

/** Próximo `sort_order` ao final da coluna (após o maior existente). */
export function nextSortOrderForColumn(tasksInColumn: Pick<Task, "sort_order">[]): number {
  if (tasksInColumn.length === 0) return SORT_ORDER_GAP;
  const max = Math.max(...tasksInColumn.map((t) => t.sort_order ?? 0));
  return max + SORT_ORDER_GAP;
}
