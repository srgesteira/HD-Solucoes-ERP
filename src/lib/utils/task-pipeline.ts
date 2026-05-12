import { DEFAULT_COLUMNS } from "@/lib/types/kanban";

/** Etapas fixas de execução (alinha com colunas padrão dos projetos Kanban). */
export const PIPELINE_STAGE_KEYS = [0, 1, 2] as const;
export type PipelineStageIndex = (typeof PIPELINE_STAGE_KEYS)[number];

export function columnRankInBoard(
  boardId: string,
  columnId: string,
  columnsByBoard: Map<string, { id: string; sort_order: number }[]>
): number {
  const cols = columnsByBoard.get(boardId);
  if (!cols?.length) return 0;
  const sorted = [...cols].sort((a, b) => a.sort_order - b.sort_order);
  const idx = sorted.findIndex((c) => c.id === columnId);
  return idx < 0 ? 0 : idx;
}

/** 1ª / 2ª / 3ª coluna do projeto; colunas extra contam como última etapa. */
export function stageIndexFromColumnRank(rank: number): PipelineStageIndex {
  return Math.min(Math.max(rank, 0), 2) as PipelineStageIndex;
}

export function stageLabel(i: PipelineStageIndex): string {
  return DEFAULT_COLUMNS[i]?.name ?? `Etapa ${i + 1}`;
}

export function stageColor(i: PipelineStageIndex): string {
  return DEFAULT_COLUMNS[i]?.color ?? "#64748b";
}

/** Detecta menção na descrição (Markdown): @email ou @parteantesdoarroba. */
export function descriptionMentionsUser(
  description: string | null | undefined,
  userEmail: string
): boolean {
  if (!description?.trim() || !userEmail.includes("@")) return false;
  const lower = description.toLowerCase();
  const emailLower = userEmail.toLowerCase();
  const local = emailLower.split("@")[0] ?? "";
  if (lower.includes(`@${emailLower}`)) return true;
  if (local && lower.includes(`@${local}`)) return true;
  return false;
}
