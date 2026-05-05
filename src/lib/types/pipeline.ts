import type { PipelineStageIndex } from "@/lib/utils/task-pipeline";

export type PipelineTask = {
  id: string;
  title: string;
  board_id: string;
  board_name: string;
  column_id: string;
  priority: string | null;
  due_date: string | null;
  assignee_id: string | null;
  created_by: string;
  stage: PipelineStageIndex;
  assignee: { id: string; full_name: string | null; email: string } | null;
};

export type PipelineStage = {
  index: PipelineStageIndex;
  label: string;
  color: string;
  tasks: PipelineTask[];
};

export type PipelineResponse = {
  stages: PipelineStage[];
  visibility: "tenant_admin" | "member_scope";
};
