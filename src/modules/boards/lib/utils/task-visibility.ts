import { descriptionMentionsUser } from "@/modules/boards/lib/utils/task-pipeline";

/** Visibilidade de tarefa para membros não-admin (alinhado ao pipeline). */
export function subtaskVisibleToMember(
  t: {
    created_by: string;
    assignee_id: string | null;
    description: string | null;
  },
  userId: string,
  myEmail: string
): boolean {
  if (t.created_by === userId) return true;
  if (t.assignee_id === userId) return true;
  if (myEmail && descriptionMentionsUser(t.description, myEmail)) return true;
  return false;
}
