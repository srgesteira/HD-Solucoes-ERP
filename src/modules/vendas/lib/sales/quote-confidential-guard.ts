/**
 * Regra do Helder: fator de venda e custo NUNCA podem sair no orçamento que vai ao cliente.
 * Verifica os textos que aparecem no PDF/impressão (observações do orçamento e dos itens,
 * descrições das linhas) e devolve os trechos suspeitos.
 */
const CONFIDENTIAL_RE = /\b(fator(es)?(\s+de\s+venda)?|markup|mark-up|custo(s)?|margem)\b/i;

type GuardQuote = {
  notes?: string | null;
  items?: Array<{
    description?: string | null;
    client_notes?: string | null;
    line_number?: number | null;
  }> | null;
};

export function findConfidentialPricingText(quote: GuardQuote): string[] {
  const hits: string[] = [];
  if (quote.notes && CONFIDENTIAL_RE.test(quote.notes)) hits.push("Observações do orçamento");
  for (const [idx, it] of (quote.items ?? []).entries()) {
    const n = it.line_number ?? idx + 1;
    if (it.client_notes && CONFIDENTIAL_RE.test(it.client_notes)) hits.push(`Observações do item ${n}`);
    if (it.description && CONFIDENTIAL_RE.test(it.description)) hits.push(`Descrição do item ${n}`);
  }
  return hits;
}

export function confidentialPricingErrorMessage(hits: string[]): string {
  return `O orçamento cita fator/custo/margem em: ${hits.join(", ")}. Isso não pode ir ao cliente — remova antes de gerar o PDF ou enviar.`;
}
