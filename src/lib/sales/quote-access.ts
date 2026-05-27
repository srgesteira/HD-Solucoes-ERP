import type { QuoteStatus } from "@/lib/types/sales.types";

/** Estados em que cabeçalho e itens podem ser alterados (com permissão de vendas). */
export const QUOTE_CONTENT_EDIT_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "approved",
  "revision",
];

export function quoteStatusAllowsContentEdit(status: string): boolean {
  return (QUOTE_CONTENT_EDIT_STATUSES as string[]).includes(status);
}
