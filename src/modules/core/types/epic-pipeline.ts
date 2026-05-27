import type { EpicOuterBucket } from "@/modules/boards/lib/utils/epic-outer-stage";

/** Cartão de épico no painel global da página Tarefas. */
export type EpicPipelineItem = {
  id: string;
  title: string;
  description: string | null;
  board_id: string;
  board_name: string;
  created_by: string;
  subtask_count: number;
  sort_order: number;
  /** Só para depuração / futuro; colunas derivadas das sub-tarefas. */
  bucket: EpicOuterBucket;
};

export type EpicsPipelineResponse = {
  columns: {
    key: "todo" | "in_progress";
    label: string;
    color: string;
    epics: EpicPipelineItem[];
  }[];
  /** Todos os épicos com 100% das sub-tarefas na última coluna do projeto. */
  finished: EpicPipelineItem[];
  visibility: "tenant_admin" | "member_scope";
  /**
   * True quando a tabela `epics` ainda não existe no Supabase.
   * O painel mostra-se vazio; é preciso aplicar a migration no projeto.
   */
  migration_pending?: boolean;
};
