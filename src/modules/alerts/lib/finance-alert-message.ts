import type { FinanceAlertChecks } from "@/modules/alerts/lib/finance-alert-checks";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(n: number): string {
  return currencyFormatter.format(n);
}

function ddmm(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Monta a mensagem do alerta financeiro na ordem de prioridade acordada:
 * 1) colisão de caixa futura, 2) contas de amanhã, 3) contas de hoje,
 * 4) vendas com entrega próxima, 5) compras chegando.
 * Texto puro montado a partir dos dados das checagens — sem IA.
 */
export function buildFinanceAlertMessage(checks: FinanceAlertChecks): string {
  const lines: string[] = [];
  lines.push("<b>📊 Resumo financeiro — HD Soluções</b>");
  lines.push("");

  // 1. Colisão de caixa futura
  if (checks.cashCollision.hasCollision && checks.cashCollision.date) {
    lines.push("🔴 <b>Colisão de caixa nos próximos 90 dias</b>");
    lines.push(
      `Saldo projetado fica negativo em <b>${ddmm(checks.cashCollision.date)}</b>: furo de ${money(
        checks.cashCollision.shortfall ?? 0
      )}.`
    );
  } else {
    lines.push("✅ Fluxo de caixa (90 dias): sem colisão projetada.");
  }
  lines.push("");

  // 2. Contas de amanhã
  lines.push(`📅 <b>Amanhã (${ddmm(checks.billsTomorrow.date)})</b>`);
  lines.push(...billsLines(checks.billsTomorrow));
  lines.push("");

  // 3. Contas de hoje
  lines.push(`📌 <b>Hoje (${ddmm(checks.billsToday.date)})</b>`);
  lines.push(...billsLines(checks.billsToday));
  lines.push("");

  // 4. Vendas com entrega nos próximos 3 dias
  lines.push("🚚 <b>Entregas de venda (próx. 3 dias)</b>");
  if (checks.salesDeliveries.length === 0) {
    lines.push("Nenhuma.");
  } else {
    for (const o of checks.salesDeliveries) {
      lines.push(
        `${ddmm(o.expected_delivery)} — ${escapeHtml(o.order_number)} · ${escapeHtml(
          o.client_name
        )} · ${money(o.total)}`
      );
    }
  }
  lines.push("");

  // 5. Compras chegando
  lines.push("📦 <b>Compras chegando (próx. 3 dias)</b>");
  if (checks.purchaseArrivals.length === 0) {
    lines.push("Nenhuma.");
  } else {
    for (const o of checks.purchaseArrivals) {
      lines.push(
        `${ddmm(o.expected_delivery)} — ${escapeHtml(o.po_number)} · ${escapeHtml(
          o.supplier_name ?? "fornecedor não informado"
        )} · ${money(o.total)}`
      );
    }
  }

  return lines.join("\n");
}

function billsLines(bills: FinanceAlertChecks["billsToday"]): string[] {
  const out: string[] = [];
  if (bills.receivables.length === 0 && bills.payables.length === 0) {
    out.push("Nenhuma conta a pagar ou a receber vencendo.");
    return out;
  }
  for (const r of bills.receivables) {
    out.push(
      `↗️ A receber: ${escapeHtml(r.client_name ?? r.document_number ?? "cliente não informado")} · ${money(
        r.current_amount
      )}`
    );
  }
  for (const p of bills.payables) {
    out.push(`↘️ A pagar: ${escapeHtml(p.description)} · ${money(p.current_amount)}`);
  }
  return out;
}
