export type EventHandler = (
  payload: Record<string, unknown>,
  tenantId: string
) => void | Promise<void>;

const handlers = new Map<string, Set<EventHandler>>();

export function subscribe(eventName: string, handler: EventHandler): () => void {
  let set = handlers.get(eventName);
  if (!set) {
    set = new Set();
    handlers.set(eventName, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
    if (set!.size === 0) handlers.delete(eventName);
  };
}

export async function publish(
  eventName: string,
  payload: Record<string, unknown>,
  tenantId: string
): Promise<void> {
  const set = handlers.get(eventName);
  if (!set?.size) return;
  const tasks = [...set].map(async (fn) => {
    try {
      await fn(payload, tenantId);
    } catch (err) {
      console.error(`[events] handler error for ${eventName}:`, err);
    }
  });
  await Promise.all(tasks);
}
