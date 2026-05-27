/** Campos de listagem/edición de tasks + área ligada (centro de custo). */
export const TASK_DETAIL_SELECT = `
  id,
  tenant_id,
  board_id,
  column_id,
  title,
  description,
  priority,
  due_date,
  assignee_id,
  epic_id,
  area_id,
  created_by,
  sort_order,
  is_completed,
  completed_at,
  created_at,
  updated_at,
  work_area:work_areas!tasks_area_id_fkey(id, code, name)
`;
