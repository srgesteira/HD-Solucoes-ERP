/** Posição do cartão de épico no painel global: 1ª coluna, 2ª, ou concluído (aba). */
export type EpicOuterBucket = "backlog" | "active" | "done";

/**
 * Deriva o estado do épico a partir das colunas internas das sub-tarefas.
 * - Sem sub-tarefas → backlog (A Fazer).
 * - Todas na última coluna do projeto → done (aba Finalizados).
 * - Qualquer tarefa na 2.ª+ coluna (índice ≥ 1) sem todas na última → active (Em Andamento).
 */
export function epicOuterBucketFromRanks(
  ranks: number[],
  columnCount: number
): EpicOuterBucket {
  if (columnCount < 1) return "backlog";
  const lastRank = columnCount - 1;
  if (ranks.length === 0) return "backlog";
  if (ranks.every((r) => r >= lastRank)) return "done";
  if (ranks.some((r) => r >= 1)) return "active";
  return "backlog";
}
