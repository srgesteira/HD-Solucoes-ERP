import type { Database } from "./database";

type PublicTables = Database["public"]["Tables"];

/* ---------- Aliases enxutos das tabelas do Módulo 1 ---------- */

export type Tenant = PublicTables["tenants"]["Row"];

export type UserProfile = PublicTables["user_profiles"]["Row"];
export type UserProfileInsert = PublicTables["user_profiles"]["Insert"];
export type UserProfileUpdate = PublicTables["user_profiles"]["Update"];

export type Board = PublicTables["boards"]["Row"];
export type BoardInsert = PublicTables["boards"]["Insert"];
export type BoardUpdate = PublicTables["boards"]["Update"];

export type BoardMember = PublicTables["board_members"]["Row"];
export type BoardMemberInsert = PublicTables["board_members"]["Insert"];

export type BoardColumn = PublicTables["board_columns"]["Row"];
export type BoardColumnInsert = PublicTables["board_columns"]["Insert"];
export type BoardColumnUpdate = PublicTables["board_columns"]["Update"];

export type Label = PublicTables["labels"]["Row"];
export type LabelInsert = PublicTables["labels"]["Insert"];

export type Task = PublicTables["tasks"]["Row"];
export type TaskInsert = PublicTables["tasks"]["Insert"];
export type TaskUpdate = PublicTables["tasks"]["Update"];

export type Epic = PublicTables["epics"]["Row"];
export type EpicInsert = PublicTables["epics"]["Insert"];
export type EpicUpdate = PublicTables["epics"]["Update"];

export type TaskComment = PublicTables["task_comments"]["Row"];
export type TaskCommentInsert = PublicTables["task_comments"]["Insert"];

export type TaskAttachment = PublicTables["task_attachments"]["Row"];
export type TaskAttachmentInsert = PublicTables["task_attachments"]["Insert"];

export type TaskActivity = PublicTables["task_activity"]["Row"];

export type WorkArea = PublicTables["work_areas"]["Row"];

/* ---------- Enums de domínio ---------- */

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const BOARD_MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type BoardMemberRole = (typeof BOARD_MEMBER_ROLES)[number];

export const PROFILE_ROLES = ["admin", "member"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

/* ---------- Composições úteis ---------- */

export interface BoardWithMembership extends Board {
  member_role: BoardMemberRole;
}

export interface BoardSummary extends BoardWithMembership {
  task_count: number;
  column_count: number;
}

export interface ColumnWithTasks extends BoardColumn {
  tasks: Task[];
}

export interface BoardDetail extends Board {
  columns: ColumnWithTasks[];
  member_role: BoardMemberRole;
}

/** Resposta da API com join opcional do assignee. */
export interface TaskAssigneePreview {
  id: string;
  full_name: string | null;
  email: string;
}

/** Join leve nas listagens para mostrar centro de custo / área. */
export interface TaskAreaPreview {
  id: string;
  code: string;
  name: string;
}

/** Campos habitualmente devolvidos pelas listagens/API (sem obrigar `external_ref_*`, etc.). */
export type TaskWithAssignee = Pick<
  Task,
  | "id"
  | "tenant_id"
  | "board_id"
  | "column_id"
  | "title"
  | "description"
  | "priority"
  | "due_date"
  | "epic_id"
  | "area_id"
  | "assignee_id"
  | "created_by"
  | "sort_order"
  | "is_completed"
  | "completed_at"
  | "created_at"
  | "updated_at"
> & {
  assignee: TaskAssigneePreview | null;
  /** Área organizacional / centro de custo (opcional por tarefa). */
  work_area: TaskAreaPreview | null;
};

/* ---------- Constantes do Módulo 1 ---------- */

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const TASK_PRIORITY_DOT_CLASS: Record<TaskPriority, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-red-600",
};

export const DEFAULT_COLUMNS: ReadonlyArray<{
  name: string;
  color: string;
  sort_order: number;
}> = [
  { name: "A Fazer", color: "#64748b", sort_order: 1000 },
  { name: "Em Andamento", color: "#0d9488", sort_order: 2000 },
  { name: "Concluído", color: "#16a34a", sort_order: 3000 },
];

export { SORT_ORDER_GAP } from "@/lib/utils/kanban-helpers";
