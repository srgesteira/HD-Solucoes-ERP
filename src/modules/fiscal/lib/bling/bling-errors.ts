/** Erro visível da integração Bling — nunca inclui tokens. */

export class BlingApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "BlingApiError";
    this.status = status;
    this.code = code;
  }
}

const SECRET_KEYS = /token|secret|authorization|password|refresh/i;

export function redactBlingValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 400) return `${value.slice(0, 400)}…`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactBlingValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redactBlingValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function messageFromBlingBody(data: unknown, httpStatus: number): string {
  if (!data || typeof data !== "object") {
    return `Bling HTTP ${httpStatus}`;
  }
  const o = data as Record<string, unknown>;
  const error = o.error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const desc =
      typeof e.description === "string"
        ? e.description
        : typeof e.message === "string"
          ? e.message
          : null;
    const type = typeof e.type === "string" ? e.type : null;
    if (desc && type) return `${type}: ${desc}`;
    if (desc) return desc;
  }
  if (typeof o.message === "string" && o.message.trim()) return o.message;
  if (typeof o.mensagem === "string" && o.mensagem.trim()) return o.mensagem;
  return `Bling HTTP ${httpStatus}`;
}

export function blingErrorCode(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const error = (data as Record<string, unknown>).error;
  if (error && typeof error === "object") {
    const type = (error as Record<string, unknown>).type;
    if (typeof type === "string") return type;
  }
  return null;
}
