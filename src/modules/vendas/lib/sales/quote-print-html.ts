import type { Tables } from "@/modules/core/types/database";
import {
  fmtQuoteBRL,
  fmtQuoteDay,
  formatCompanyAddressForPrint,
  formatQuoteNumberWithRevision,
  unwrapQuoteCustomer,
  unwrapQuoteProductCode,
  unwrapQuoteProductDescription,
  unwrapQuoteProductName,
  quoteItemPrintDescription,
  type QuotePrintData,
} from "@/modules/vendas/lib/sales/quote-display";
import { resolvePaymentTermsDisplayText } from "@/shared/utils/payment-terms-format";

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTaxRegimeLabel(
  regime: string | null | undefined
): string | null {
  switch ((regime ?? "").trim()) {
    case "simples":
      return "Simples Nacional";
    case "presumido":
      return "Lucro Presumido";
    case "real":
      return "Lucro Real";
    case "mei":
      return "MEI";
    default:
      return null;
  }
}

const STYLES = `
@page { size: A4; margin: 10mm 10mm 16mm 10mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.35;
  color: #0f172a;
}
.qp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1.5px solid #1e293b;
}
.qp-logo { max-height: 64px; max-width: 200px; object-fit: contain; }
.qp-company-meta { margin: 1px 0; font-size: 9pt; color: #475569; text-align: right; }
.qp-doc-title {
  text-align: center;
  font-size: 13pt;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1e293b;
  margin: 12px 0 0;
}
.qp-doc-number { text-align: center; font-size: 10pt; color: #64748b; margin: 2px 0 12px; }
.qp-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  margin-bottom: 8px;
}
.qp-info-col { padding: 8px 10px; }
.qp-info-col + .qp-info-col { border-left: 1px solid #e2e8f0; }
.qp-info-col h3 {
  margin: 0 0 4px;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  font-weight: 700;
}
.qp-info-row { display: flex; justify-content: space-between; gap: 8px; font-size: 9pt; margin-bottom: 2px; }
.qp-info-row span:first-child { color: #64748b; }
.qp-info-row span:last-child { font-weight: 600; text-align: right; }
.qp-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.qp-pair--single { grid-template-columns: 1fr; }
.qp-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
}
.qp-box h2 {
  margin: 0 0 6px;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  font-weight: 700;
}
.qp-box-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 9pt; }
.qp-box-grid .full { grid-column: 1 / -1; }
.qp-box-grid dt { color: #64748b; font-size: 8pt; margin: 0; }
.qp-box-grid dd { margin: 0; font-weight: 600; }
table.qp-items {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 4px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  overflow: hidden;
  font-size: 9pt;
}
table.qp-items thead { background: #1e293b; color: #fff; }
table.qp-items thead th { padding: 5px 6px; text-align: left; font-size: 8.5pt; font-weight: 600; }
table.qp-items thead th.num { text-align: right; }
table.qp-items thead th.qty-col { text-align: center; width: 56px; }
table.qp-items thead th.code-col { width: 110px; }
table.qp-items tbody td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
table.qp-items tbody tr:last-child td { border-bottom: none; }
table.qp-items tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.qp-items tbody td.qty { text-align: center; }
.qp-code { font-family: ui-monospace, monospace; font-size: 8.5pt; }
.qp-product-name { font-weight: 600; }
.qp-product-desc { margin: 3px 0 0; font-size: 8.5pt; color: #475569; }
.qp-totals {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}
.qp-totals dl {
  width: 240px;
  margin: 0;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}
.qp-totals .row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 9pt; border-bottom: 1px solid #f1f5f9; }
.qp-totals .row:last-child { border-bottom: none; }
.qp-totals .row.grand { background: #f8fafc; padding: 6px 8px; }
.qp-totals .row.grand dt { font-weight: 800; font-size: 10pt; }
.qp-totals .row.grand dd { font-weight: 800; font-size: 11pt; color: #1e293b; }
.qp-totals dt, .qp-totals dd { margin: 0; }
.qp-totals dd { font-variant-numeric: tabular-nums; font-weight: 600; }
.qp-notes {
  margin-top: 8px;
  padding: 6px 10px;
  border-left: 2px solid #1e293b;
  background: #f8fafc;
  font-size: 9pt;
  white-space: pre-wrap;
}
.qp-importante {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 8.5pt;
  color: #334155;
}
.qp-importante h2 {
  margin: 0 0 4px;
  font-size: 9pt;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #0f172a;
}
.qp-importante ol { margin: 0; padding-left: 18px; }
.qp-importante .footer { margin-top: 4px; white-space: pre-wrap; }
`;

/**
 * Gera o HTML completo (head+body) do orçamento, pronto para virar PDF
 * via puppeteer ou para ser apresentado num webview embutido.
 *
 * Reaproveita os helpers de `quote-display` para manter uma única regra
 * de formatação (princípio §1.1).
 */
export function buildQuotePrintHtml(
  quote: QuotePrintData,
  company: Tables<"company_settings"> | null | undefined,
  logoSrc: string | null = null
): string {
  const cust = unwrapQuoteCustomer(quote.customer, quote.client_name);
  const items = Array.isArray(quote.items) ? quote.items : [];
  const addr = company ? formatCompanyAddressForPrint(company) : null;
  const taxRegimeLabel = company ? getTaxRegimeLabel(company.tax_regime) : null;

  const hasCommercial =
    quote.payment_installments != null ||
    Boolean(quote.payment_terms?.trim()) ||
    Boolean(quote.delivery_deadline?.trim()) ||
    Boolean(quote.shipping_type?.trim()) ||
    Boolean(taxRegimeLabel);

  const importantePoints: string[] = [];
  if (taxRegimeLabel) {
    importantePoints.push(
      `Empresa enquadrada no regime tributário ${taxRegimeLabel}.`
    );
  }
  if (company?.address_state?.trim()) {
    importantePoints.push(
      `Os tributos inclusos neste orçamento estão baseados na legislação da esfera federal e do estado de ${company.address_state.trim()}.`
    );
  }
  if (quote.shipping_type === "CIF") {
    importantePoints.push(
      "No caso de transporte na modalidade CIF, o horário da entrega é comercial e a descarga do caminhão é de responsabilidade do cliente."
    );
  }
  const documentFooter = company?.document_footer?.trim() ?? "";
  const showImportante =
    importantePoints.length > 0 || Boolean(documentFooter);

  const contactLine = company
    ? [
        company.phone?.trim() ? `Tel. ${company.phone.trim()}` : null,
        company.email?.trim() ?? null,
        company.website?.trim() ?? null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const headerCompanyHtml = company
    ? `<div>
        ${
          company.cnpj?.trim() ||
          company.state_registration?.trim() ||
          taxRegimeLabel
            ? `<p class="qp-company-meta">${[
                company.cnpj?.trim() ? `CNPJ ${escapeHtml(company.cnpj.trim())}` : null,
                company.state_registration?.trim()
                  ? `IE ${escapeHtml(company.state_registration.trim())}`
                  : null,
                taxRegimeLabel ? escapeHtml(taxRegimeLabel) : null,
              ]
                .filter(Boolean)
                .join(" · ")}</p>`
            : ""
        }
        ${addr ? `<p class="qp-company-meta">${escapeHtml(addr)}</p>` : ""}
        ${contactLine ? `<p class="qp-company-meta">${escapeHtml(contactLine)}</p>` : ""}
      </div>`
    : `<div></div>`;

  const itemsHtml =
    items.length > 0
      ? items
          .map((line) => {
            const showProductDesc = Boolean(line.show_product_description);
            const productDesc = showProductDesc
              ? unwrapQuoteProductDescription(line.product)
              : null;
            const extraDesc = showProductDesc
              ? quoteItemPrintDescription(line.description, line.product)
              : null;
            const code = unwrapQuoteProductCode(line.product);
            const name = unwrapQuoteProductName(line.product);
            return `<tr>
              <td class="qp-code">${escapeHtml(code)}</td>
              <td>
                <div class="qp-product-name">${escapeHtml(name)}</div>
                ${productDesc ? `<p class="qp-product-desc"><strong>Descrição:</strong> ${escapeHtml(productDesc)}</p>` : ""}
                ${extraDesc && extraDesc !== productDesc ? `<p class="qp-product-desc"><strong>Detalhe:</strong> ${escapeHtml(extraDesc)}</p>` : ""}
                ${line.client_notes?.trim() ? `<p class="qp-product-desc"><strong>Observações:</strong> ${escapeHtml(line.client_notes.trim())}</p>` : ""}
              </td>
              <td class="qty">${escapeHtml(String(Number(line.quantity)))}${line.unit?.trim() ? ` ${escapeHtml(line.unit.trim())}` : ""}</td>
              <td class="num">${escapeHtml(fmtQuoteBRL(Number(line.unit_price)))}</td>
              <td class="num"><strong>${escapeHtml(fmtQuoteBRL(Number(line.total_price)))}</strong></td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" style="text-align:center;padding:12px;">Sem itens neste orçamento.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento ${escapeHtml(formatQuoteNumberWithRevision(quote.quote_number, quote.revision_number))}</title>
<style>${STYLES}</style>
</head>
<body>
  <header class="qp-header">
    <div>${logoSrc ? `<img class="qp-logo" src="${escapeHtml(logoSrc)}" alt="" />` : ""}</div>
    ${headerCompanyHtml}
  </header>
  <h1 class="qp-doc-title">Orçamento comercial</h1>
  <p class="qp-doc-number">Nº ${escapeHtml(formatQuoteNumberWithRevision(quote.quote_number, quote.revision_number))}</p>

  <section class="qp-info-grid">
    <div class="qp-info-col">
      <h3>Dados do orçamento</h3>
      <div class="qp-info-row"><span>Data</span><span>${escapeHtml(fmtQuoteDay(quote.quote_date))}</span></div>
      <div class="qp-info-row"><span>Validade</span><span>${escapeHtml(fmtQuoteDay(quote.valid_until))}${quote.validity_days != null ? ` (${quote.validity_days}d)` : ""}</span></div>
    </div>
    <div class="qp-info-col">
      <h3>Controlo</h3>
      <div class="qp-info-row"><span>Registado em</span><span>${escapeHtml(fmtQuoteDay(quote.created_at))}</span></div>
    </div>
  </section>

  <div class="qp-pair${hasCommercial ? "" : " qp-pair--single"}">
    <section class="qp-box">
      <h2>Cliente</h2>
      <dl class="qp-box-grid">
        <div><dt>Nome</dt><dd>${escapeHtml(cust?.name ?? quote.client_name)}</dd></div>
        <div><dt>Documento</dt><dd>${escapeHtml(cust?.document ?? "—")}</dd></div>
        <div><dt>E-mail</dt><dd>${escapeHtml(quote.client_email ?? cust?.email ?? "—")}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(cust?.phone ?? "—")}</dd></div>
        ${cust?.address ? `<div class="full"><dt>Endereço</dt><dd>${escapeHtml(cust.address)}</dd></div>` : ""}
      </dl>
    </section>
    ${
      hasCommercial
        ? `<section class="qp-box">
            <h2>Condições comerciais</h2>
            <dl class="qp-box-grid">
              <div><dt>Pagamento</dt><dd>${escapeHtml(
                resolvePaymentTermsDisplayText(quote.payment_terms, {
                  payment_installments: quote.payment_installments,
                  payment_days_to_first_due: quote.payment_days_to_first_due,
                  payment_days_between_installments:
                    quote.payment_days_between_installments,
                })
              )}</dd></div>
              <div><dt>Prazo de entrega</dt><dd>${escapeHtml(quote.delivery_deadline?.trim() || "—")}</dd></div>
              <div><dt>Frete</dt><dd>${escapeHtml(quote.shipping_type?.trim() || "—")}${quote.shipping_type === "CIF" && Number(quote.freight_cost ?? 0) > 0 ? ` — ${escapeHtml(fmtQuoteBRL(Number(quote.freight_cost)))}` : ""}</dd></div>
              ${taxRegimeLabel ? `<div class="full"><dt>Regime tributário</dt><dd>${escapeHtml(taxRegimeLabel)}</dd></div>` : ""}
            </dl>
          </section>`
        : ""
    }
  </div>

  <table class="qp-items">
    <thead>
      <tr>
        <th class="code-col">Código</th>
        <th>Produto</th>
        <th class="qty-col">Qtd.</th>
        <th class="num">Preço unit.</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="qp-totals">
    <dl>
      <div class="row"><dt>Subtotal</dt><dd>${escapeHtml(fmtQuoteBRL(quote.subtotal))}</dd></div>
      ${quote.discount > 0 ? `<div class="row"><dt>Desconto</dt><dd>− ${escapeHtml(fmtQuoteBRL(quote.discount))}</dd></div>` : ""}
      <div class="row"><dt>Impostos</dt><dd>${escapeHtml(fmtQuoteBRL(quote.tax))}</dd></div>
      ${quote.shipping_type === "CIF" && Number(quote.freight_cost ?? 0) > 0 ? `<div class="row"><dt>Frete (CIF)</dt><dd>${escapeHtml(fmtQuoteBRL(Number(quote.freight_cost)))}</dd></div>` : ""}
      <div class="row grand"><dt>Total</dt><dd>${escapeHtml(fmtQuoteBRL(quote.total))}</dd></div>
    </dl>
  </div>

  ${quote.notes?.trim() ? `<section class="qp-notes"><strong>Observações: </strong>${escapeHtml(quote.notes.trim())}</section>` : ""}

  ${
    showImportante
      ? `<section class="qp-importante">
          <h2>Importante</h2>
          ${importantePoints.length > 0 ? `<ol>${importantePoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ol>` : ""}
          ${documentFooter ? `<div class="footer">${escapeHtml(documentFooter)}</div>` : ""}
        </section>`
      : ""
  }
</body>
</html>`;
}
