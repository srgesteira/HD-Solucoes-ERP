export const ENGINEERING_STATUS_PENDING = "pending_composition" as const;
export const ENGINEERING_STATUS_RELEASED = "released" as const;

export type EngineeringWorkflowStatus =
  | typeof ENGINEERING_STATUS_PENDING
  | typeof ENGINEERING_STATUS_RELEASED;

export function isPendingComposition(
  status: string | null | undefined
): boolean {
  return status === ENGINEERING_STATUS_PENDING;
}
