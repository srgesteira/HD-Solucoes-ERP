import type { TaskAssigneePreview, TaskWithAssignee } from "@/modules/core/types/kanban";
import type { TaskAreaPreview } from "@/modules/core/types/kanban";

type TaskRowSansAssigneeEmbed = Omit<TaskWithAssignee, "assignee" | "work_area">;

export type TaskRowWithAreaEmbed = TaskRowSansAssigneeEmbed & {
  work_area?: TaskAreaPreview | null;
};

export function enrichTasksWithAssigneeAndArea(
  rows: TaskRowWithAreaEmbed[],
  assigneeMap: Map<string, TaskAssigneePreview>
): TaskWithAssignee[] {
  return rows.map((t) => {
    const { work_area: wa, assignee_id, ...rest } = t;
    return {
      ...(rest as TaskRowSansAssigneeEmbed),
      assignee_id,
      assignee: assignee_id ? assigneeMap.get(assignee_id) ?? null : null,
      work_area: wa ?? null,
    };
  });
}
